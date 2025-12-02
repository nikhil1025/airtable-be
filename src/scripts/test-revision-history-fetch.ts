import axios from "axios";
import * as cheerio from "cheerio";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database";
import AirtableConnection from "../models/AirtableConnection";
import RevisionHistory from "../models/RevisionHistory";
import Ticket from "../models/Ticket";
import { decrypt, isEncrypted } from "../utils/encryption";
import { logger } from "../utils/errors";

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
    };

    revisions.push(revision);
  });

  return revisions;
}

/**
 * Fetch revision history for a single record
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
      logger.error("Failed to fetch revision history", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    }
    throw error;
  }
}

/**
 * Process revision history for a single record
 */
async function processRecordRevisionHistory(
  recordId: string,
  baseId: string,
  cookies: string,
  applicationId: string
): Promise<ParsedRevision[]> {
  try {
    const response = await fetchRevisionHistory(
      recordId,
      cookies,
      applicationId
    );

    if (response.msg !== "SUCCESS") {
      logger.warn("API response not successful", {
        recordId,
        msg: response.msg,
      });
      return [];
    }

    // Parse activities
    const allRevisions: ParsedRevision[] = [];
    const rowActivityInfoById = response.data.rowActivityInfoById || {};
    const userInfoById = response.data.rowActivityOrCommentUserObjById || {};

    for (const [activityId, activityData] of Object.entries(
      rowActivityInfoById
    ) as [string, any][]) {
      const userId = activityData.originatingUserId;
      const userInfo = userInfoById[userId];

      const parsedRevisions = parseActivityHTML(
        activityId,
        activityData,
        recordId,
        baseId,
        userInfo
      );

      allRevisions.push(...parsedRevisions);
    }

    return allRevisions;
  } catch (error) {
    logger.error("Failed to fetch revision history for record", {
      recordId,
      error,
    });
    return [];
  }
}

/**
 * Main script to fetch revision history for all tickets from MongoDB
 */
async function main() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info("Connected to database");

    // Find a user with valid cookies
    const connection = await AirtableConnection.findOne({
      cookies: { $exists: true, $ne: null },
    });

    if (!connection) {
      throw new Error("No Airtable connection found with cookies");
    }

    logger.info("Found Airtable connection", {
      userId: connection.userId,
      hasCookies: !!connection.cookies,
      hasAccessToken: !!connection.accessToken,
    });

    // Decrypt cookies
    let cookies = connection.cookies!;
    if (isEncrypted(cookies)) {
      logger.info("Cookies are encrypted, decrypting...");
      cookies = decrypt(cookies);
      logger.info("Cookies decrypted successfully");
    }

    // Fetch all tickets from MongoDB
    const tickets = await Ticket.find().sort({ createdTime: -1 });

    logger.info("Found tickets in database", { count: tickets.length });
    console.log("\n========================================");
    console.log(`PROCESSING ${tickets.length} TICKETS FROM MONGODB`);
    console.log("========================================\n");

    if (tickets.length === 0) {
      console.log("No tickets found in the database.");
      return;
    }

    let totalRevisions = 0;
    let processedCount = 0;
    let errorCount = 0;

    // Process each ticket
    for (const ticket of tickets) {
      processedCount++;
      const recordId = ticket.airtableRecordId;
      const baseId = ticket.baseId;

      console.log(
        `\n[${processedCount}/${tickets.length}] Processing: ${recordId}`
      );
      console.log(`   Base: ${baseId}`);

      try {
        const revisions = await processRecordRevisionHistory(
          recordId,
          baseId,
          cookies,
          baseId // Using baseId as applicationId
        );

        if (revisions.length > 0) {
          console.log(`   ✓ Found ${revisions.length} Status/Assignee changes`);

          // Store in database
          for (const revision of revisions) {
            try {
              await RevisionHistory.findOneAndUpdate(
                { uuid: revision.uuid },
                revision,
                { upsert: true, new: true }
              );
            } catch (error) {
              logger.error("Failed to store revision", {
                uuid: revision.uuid,
                error,
              });
            }
          }

          totalRevisions += revisions.length;

          // Show sample changes
          revisions.forEach((rev, index) => {
            console.log(
              `      [${index + 1}] ${rev.columnType}: "${rev.oldValue}" → "${
                rev.newValue
              }"`
            );
          });
        } else {
          console.log(`   - No Status/Assignee changes found`);
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        errorCount++;
        console.log(`   ✗ Error processing record`);
        logger.error("Error processing ticket", { recordId, error });
      }
    }

    console.log("\n========================================");
    console.log("PROCESSING COMPLETE");
    console.log("========================================");
    console.log(`Total Tickets Processed: ${processedCount}`);
    console.log(`Total Revisions Found: ${totalRevisions}`);
    console.log(`Errors: ${errorCount}`);
    console.log("========================================\n");

    logger.info("Revision history processing completed", {
      totalTickets: tickets.length,
      processedCount,
      totalRevisions,
      errorCount,
    });
  } catch (error) {
    logger.error("Script failed", error);
    console.error("\nError:", error);
  } finally {
    await mongoose.disconnect();
    logger.info("Disconnected from database");
  }
}

// Run the script
main();
