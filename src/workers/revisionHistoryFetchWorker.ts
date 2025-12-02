import axios from "axios";
import * as cheerio from "cheerio";
import mongoose from "mongoose";
import { parentPort, workerData } from "worker_threads";
import { connectDatabase } from "../config/database";
import RevisionHistory from "../models/RevisionHistory";
import { logger } from "../utils/errors";

interface TaskItem {
  recordId: string;
  baseId: string;
  cookies: string;
  applicationId: string;
  userId: string;
}

interface WorkerData {
  workerId: number;
  tasks: TaskItem[];
}

interface ParsedRevision {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: string;
  newValue: string;
  createdDate: Date;
  authoredBy: string;
  authorName?: string;
  baseId: string;
  tableId?: string;
  userId: string;
}

/**
 * Parse HTML from diffRowHtml to extract Status and Assignee changes
 */
function parseActivityHTML(
  activityId: string,
  activityData: {
    createdTime: string;
    originatingUserId: string;
    diffRowHtml: string;
    groupType: string;
  },
  recordId: string,
  baseId: string,
  userId: string,
  tableId?: string,
  userInfo?: { name?: string }
): ParsedRevision[] {
  const $ = cheerio.load(activityData.diffRowHtml);
  const revisions: ParsedRevision[] = [];

  // Find all historicalCellContainer divs
  $(".historicalCellContainer").each((index, container) => {
    const $container = $(container);

    // Extract column name from the header
    const columnName = $container.find(".micro.strong.caps").text().trim();

    // Check if this is Status or Assignee field
    const isStatus = columnName.toLowerCase().includes("status");
    const isAssignee =
      columnName.toLowerCase().includes("assigned") ||
      columnName.toLowerCase().includes("assignee");

    if (!isStatus && !isAssignee) {
      return; // Skip this field
    }

    const columnType = isStatus ? "Status" : "Assignee";

    // Extract old and new values
    let oldValue = "";
    let newValue = "";

    // Find elements with strikethrough (removed/old values)
    $container
      .find('[style*="strikethrough"], .strikethrough, del')
      .each((_i, el) => {
        const text = $(el).text().trim();
        if (text) {
          oldValue = text;
        }
      });

    // Find added elements (new values)
    $container.find(".added, .foreignRecord.added").each((_i, el) => {
      const text = $(el).text().trim();
      if (text) {
        newValue = text;
      }
    });

    // For status changes, look for pill elements
    if (isStatus) {
      const pills = $container.find(".pill, .choiceToken");
      pills.each((_i, pill) => {
        const $pill = $(pill);
        const text = $pill.find(".truncate-pre, .flex-auto").text().trim();

        if (
          $pill.css("text-decoration")?.includes("line-through") ||
          $pill.parent().find('svg use[href*="Minus"]').length > 0
        ) {
          oldValue = text;
        } else if ($pill.parent().find('svg use[href*="Plus"]').length > 0) {
          newValue = text;
        }
      });
    }

    // For assignee changes, look for foreign record elements
    if (isAssignee) {
      $container.find(".foreignRecord").each((_i, record) => {
        const $record = $(record);
        const text = $record.text().trim();

        if ($record.hasClass("added")) {
          newValue = text;
        }
      });
    }

    // Handle null to value changes
    const isNullToValue = $container.find(".nullToValue").length > 0;
    if (isNullToValue && !oldValue) {
      oldValue = "null";
    }

    // Create revision entry
    const revision: ParsedRevision = {
      uuid: `${activityId}_${index}`,
      issueId: recordId,
      columnType,
      oldValue,
      newValue,
      createdDate: new Date(activityData.createdTime),
      authoredBy: activityData.originatingUserId,
      authorName: userInfo?.name,
      baseId,
      tableId,
      userId,
    };

    revisions.push(revision);
  });

  return revisions;
}

/**
 * Fetch revision history for a single record using axios (NO PUPPETEER)
 */
async function fetchRevisionHistory(
  recordId: string,
  cookies: string,
  applicationId: string
): Promise<any> {
  const url = `https://airtable.com/v0.3/row/${recordId}/readRowActivitiesAndComments`;

  const params = {
    stringifiedObjectParams: JSON.stringify({
      limit: 100,
      offsetV2: null,
      shouldReturnDeserializedActivityItems: true,
      shouldIncludeRowActivityOrCommentUserObjById: true,
    }),
    requestId: `req${Math.random().toString(36).substr(2, 9)}`,
    secretSocketId: `soc${Math.random().toString(36).substr(2, 9)}`,
  };

  const headers = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    cookie: cookies,
    pragma: "no-cache",
    referer: `https://airtable.com/${applicationId}/`,
    "sec-ch-ua":
      '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "x-airtable-application-id": applicationId,
    "x-airtable-inter-service-client": "webClient",
    "x-requested-with": "XMLHttpRequest",
    "x-time-zone": "Asia/Calcutta",
    "x-user-locale": "en",
  };

  try {
    const response = await axios.get(url, {
      params,
      headers,
      timeout: 30000,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error("Failed to fetch revision history in worker", {
        recordId,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
    }
    throw error;
  }
}

/**
 * Worker thread main function - BATCH PROCESSING
 * Connects to MongoDB ONCE and processes all assigned tasks
 * NO PUPPETEER - Uses axios for direct HTTP requests
 */
async function processBatch(data: WorkerData) {
  const { workerId, tasks } = data;
  const results: any[] = [];

  try {
    // Connect to database ONCE per worker
    await connectDatabase();
    console.log(
      `[Worker ${workerId}] Connected to MongoDB, processing ${tasks.length} tasks`
    );

    const batchRevisions: ParsedRevision[] = [];

    // Process all tasks in this batch
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const { recordId, baseId, cookies, applicationId, userId } = task;

      try {
        // Fetch revision history using axios (NO PUPPETEER)
        const response = await fetchRevisionHistory(
          recordId,
          cookies,
          applicationId
        );

        if (response.msg !== "SUCCESS") {
          results.push({
            success: false,
            recordId,
            error: "API response not successful",
            revisionsFound: 0,
          });
          continue;
        }

        // Parse activities
        const allRevisions: ParsedRevision[] = [];
        const rowActivityInfoById = response.data.rowActivityInfoById || {};
        const userInfoById =
          response.data.rowActivityOrCommentUserObjById || {};

        for (const [activityId, activityData] of Object.entries(
          rowActivityInfoById
        ) as [string, any][]) {
          const authorId = activityData.originatingUserId;
          const userInfo = userInfoById[authorId];

          const parsedRevisions = parseActivityHTML(
            activityId,
            activityData,
            recordId,
            baseId,
            userId,
            undefined, // tableId not available in this context
            userInfo
          );

          allRevisions.push(...parsedRevisions);
        }

        // Collect revisions for batch insert
        batchRevisions.push(...allRevisions);

        results.push({
          success: true,
          recordId,
          revisionsFound: allRevisions.length,
        });

        // Send progress update
        if (parentPort) {
          parentPort.postMessage({
            type: "progress",
            workerId,
            processed: i + 1,
            total: tasks.length,
            recordId,
            revisionsFound: allRevisions.length,
          });
        }
      } catch (error: any) {
        results.push({
          success: false,
          recordId,
          error: error.message || "Unknown error",
          revisionsFound: 0,
        });
      }
    }

    // Batch insert all revisions at once using bulkWrite
    if (batchRevisions.length > 0) {
      console.log(
        `[Worker ${workerId}] Batch inserting ${batchRevisions.length} revisions...`
      );

      const bulkOps = batchRevisions.map((revision) => ({
        updateOne: {
          filter: { uuid: revision.uuid },
          update: { $set: revision },
          upsert: true,
        },
      }));

      try {
        await RevisionHistory.bulkWrite(bulkOps, { ordered: false });
        console.log(
          `[Worker ${workerId}] Successfully stored ${batchRevisions.length} revisions`
        );
      } catch (error) {
        logger.error(`Worker ${workerId} - Failed to bulk write revisions`, {
          error,
        });
      }
    }

    // Disconnect from database ONCE after all processing
    await mongoose.disconnect();
    console.log(
      `[Worker ${workerId}] Completed batch processing, disconnected from MongoDB`
    );

    return {
      type: "complete",
      workerId,
      results,
      totalRevisions: batchRevisions.length,
    };
  } catch (error: any) {
    return {
      type: "error",
      workerId,
      error: error.message || "Unknown error",
      results,
    };
  }
}

// Execute worker
if (parentPort && workerData) {
  processBatch(workerData)
    .then((result) => {
      parentPort!.postMessage(result);
    })
    .catch((error) => {
      parentPort!.postMessage({
        type: "error",
        workerId: workerData.workerId,
        error: error.message,
        results: [],
      });
    });
}
