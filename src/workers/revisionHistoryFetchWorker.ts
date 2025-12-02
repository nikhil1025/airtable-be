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
 * Parse HTML from diffRowHtml to extract ALL field changes
 * Supports: select, foreignKey, asyncText, text, number, and more
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

    if (!columnName) {
      return; // Skip if no column name found
    }

    // Extract the data-columntype attribute to identify field type
    const valueContainer = $container.find(".historicalCellValue");
    const dataColumnType =
      valueContainer.attr("data-columntype") ||
      $container.find("[data-columntype]").first().attr("data-columntype") ||
      "unknown";

    // Normalize field names
    let normalizedColumnName = columnName;
    if (columnName.toLowerCase().includes("assigned to")) {
      normalizedColumnName = "Assignee";
    }

    // Create detailed columnType: "FieldName (fieldType)"
    const columnType =
      dataColumnType !== "unknown"
        ? `${normalizedColumnName} (${dataColumnType})`
        : normalizedColumnName;

    // Extract old and new values based on column type
    let oldValue = "";
    let newValue = "";

    // Handle different column types
    switch (dataColumnType) {
      case "select": {
        // Single select fields (like Status)
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
        break;
      }

      case "foreignKey": {
        // Foreign key fields (like Assigned To, Reported By)
        $container.find(".foreignRecord").each((_i, record) => {
          const $record = $(record);
          const text = $record.text().trim();

          if ($record.hasClass("added")) {
            newValue = text;
          } else if (
            $record.css("text-decoration")?.includes("line-through") ||
            $record.parent().css("text-decoration")?.includes("line-through")
          ) {
            oldValue = text;
          }
        });
        break;
      }

      case "asyncText":
      case "text":
      case "multilineText": {
        // Text fields including AI-generated fields
        const textDiff = $container.find(".textDiff");

        if (textDiff.length > 0) {
          // Handle text diffs with additions and deletions
          let oldParts: string[] = [];
          let newParts: string[] = [];

          textDiff.contents().each((_i, node) => {
            const $node = $(node);

            if (
              $node.hasClass("colors-background-negative") ||
              $node.hasClass("colors-foreground-accent-negative") ||
              $node.hasClass("strikethrough")
            ) {
              // Removed text
              oldParts.push($node.text());
            } else if ($node.hasClass("colors-background-success")) {
              // Added text
              newParts.push($node.text());
            } else if ($node.hasClass("unchangedPart")) {
              // Unchanged text - add to both
              const text = $node.text();
              oldParts.push(text);
              newParts.push(text);
            } else if ($node.hasClass("pre-wrap")) {
              // Check for specific classes within pre-wrap
              if (
                $node.hasClass("colors-background-negative") ||
                $node.hasClass("colors-foreground-accent-negative") ||
                $node.hasClass("strikethrough")
              ) {
                oldParts.push($node.text());
              } else if ($node.hasClass("colors-background-success")) {
                newParts.push($node.text());
              }
            }
          });

          oldValue = oldParts.join("").trim();
          newValue = newParts.join("").trim();
        } else {
          // Simple text change without diff - check for added/removed classes
          const hasAdded =
            $container.find(
              ".colors-background-success, .inline-block.truncate.colors-background-success"
            ).length > 0;
          if (hasAdded) {
            newValue = $container
              .find(
                ".colors-background-success, .inline-block.truncate.colors-background-success"
              )
              .text()
              .trim();
          } else {
            newValue = $container.find(".historicalCellValue").text().trim();
          }
        }
        break;
      }

      case "number": {
        // Number fields
        const diffContainer = $container.find(".historicalCellValue.diff");

        if (diffContainer.length > 0) {
          // Has old and new values
          oldValue = diffContainer
            .find(".colors-background-negative, .strikethrough")
            .first()
            .text()
            .trim();
          newValue = diffContainer
            .find(".colors-background-success")
            .first()
            .text()
            .trim();
        } else {
          // Null to value or simple change
          newValue = $container
            .find(".colors-background-success, .inline-block")
            .text()
            .trim();
        }
        break;
      }

      case "date":
      case "dateTime": {
        // Date and DateTime fields
        const diffContainer = $container.find(".historicalCellValue.diff");

        if (diffContainer.length > 0) {
          // Has old and new values
          oldValue = diffContainer
            .find(".colors-background-negative, .strikethrough")
            .first()
            .text()
            .trim();
          newValue = diffContainer
            .find(".colors-background-success")
            .first()
            .text()
            .trim();
        } else {
          // Null to value
          const dateText = $container
            .find(".truncate.css-10jy3hn")
            .text()
            .trim();
          const timeZone = $container
            .find(".caps.colors-foreground-subtle")
            .text()
            .trim();
          newValue = timeZone ? `${dateText} ${timeZone}` : dateText;
        }
        break;
      }

      default: {
        // Generic handler for other column types
        // Find elements with strikethrough (removed/old values)
        $container
          .find(
            '[style*="strikethrough"], .strikethrough, del, .colors-foreground-accent-negative'
          )
          .each((_i, el) => {
            const text = $(el).text().trim();
            if (text && !oldValue) {
              oldValue = text;
            }
          });

        // Find added elements (new values)
        $container
          .find(".added, .foreignRecord.added, .colors-background-success")
          .each((_i, el) => {
            const text = $(el).text().trim();
            if (text && !newValue) {
              newValue = text;
            }
          });

        // If no specific markers found, try to get the value directly
        if (!oldValue && !newValue) {
          newValue = $container.find(".historicalCellValue").text().trim();
        }
        break;
      }
    }

    // Handle null to value changes
    const isNullToValue = $container.find(".nullToValue").length > 0;
    if (isNullToValue && !oldValue) {
      oldValue = "";
    }

    // Handle value to null changes
    const isValueToNull = $container.find(".valueToNull").length > 0;
    if (isValueToNull && !newValue) {
      newValue = "";
    }

    // Create revision entry only if there's a meaningful change
    if (oldValue || newValue) {
      const revision: ParsedRevision = {
        uuid: `${activityId}_${index}`,
        issueId: recordId,
        columnType,
        oldValue: oldValue || "",
        newValue: newValue || "",
        createdDate: new Date(activityData.createdTime),
        authoredBy: userInfo?.name || activityData.originatingUserId,
        authorName: userInfo?.name,
        baseId,
        tableId,
        userId,
      };

      revisions.push(revision);
    }
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
