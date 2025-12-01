import axios from "axios";
import { Request, Response } from "express";
import { RevisionHistory, Ticket } from "../models";
import { EnhancedCookieValidator } from "../services/EnhancedCookieValidator";
import { RevisionChange } from "../types";
import { AppError, logger } from "../utils/errors";

/**
 * BULK REVISION HISTORY AUTOMATION
 *
 * Steps:
 * 1. Get all tickets from MongoDB (airtableRecordId field)
 * 2. Validate cookies properly
 * 3. Create URL list with exact format user provided
 * 4. Iterate through each record hitting the endpoint
 * 5. Extract revision history in specified JSON format
 * 6. Store in revision history collection
 * 7. Print everything to terminal with detailed logging
 */
export async function bulkRevisionHistoryAutomation(
  req: Request,
  res: Response
) {
  try {
    console.log("\n STARTING BULK REVISION HISTORY AUTOMATION");
    console.log("=".repeat(60));

    const { userId } = req.body;

    if (!userId) {
      throw new AppError("userId is required", 400, "MISSING_USER_ID");
    }

    console.log(`[INFO] User ID: ${userId}`);

    // STEP 1: Get all tickets from MongoDB
    console.log("\n STEP 1: Fetching all tickets from MongoDB");
    console.log("-".repeat(40));

    const tickets = await Ticket.find({ userId }).select(
      "airtableRecordId baseId tableId title status assignee"
    );

    if (tickets.length === 0) {
      throw new AppError("No tickets found for user", 404, "NO_TICKETS");
    }

    console.log(` Found ${tickets.length} tickets in database`);

    // Print sample tickets
    console.log("\n Sample tickets:");
    tickets.slice(0, 3).forEach((ticket, index) => {
      console.log(`${index + 1}. Record ID: ${ticket.airtableRecordId}`);
      console.log(`   Title: ${(ticket as any).title || "No title"}`);
      console.log(`   Status: ${(ticket as any).status || "No status"}`);
      console.log(`   Base ID: ${ticket.baseId}`);
      console.log(`   Table ID: ${ticket.tableId}`);
    });

    // STEP 2: Validate cookies properly with all auth data
    console.log(
      "\n STEP 2: Validating ALL authentication data (cookies + localStorage + session)"
    );
    console.log("-".repeat(40));

    const authValidation =
      await EnhancedCookieValidator.validateAllAuthenticationData(userId);

    if (!authValidation.isValid) {
      throw new AppError(
        `Authentication failed: ${authValidation.message}`,
        401,
        "INVALID_AUTH"
      );
    }

    console.log(" All authentication data validated successfully");
    console.log(` Status: ${authValidation.message}`);

    const { cookies, localStorage, sessionData } = authValidation;

    // STEP 3: Create URL list with exact format
    console.log("\n STEP 3: Creating URL list with exact format");
    console.log("-".repeat(40));

    const urlList: Array<{
      recordId: string;
      url: string;
      baseId: string;
      tableId: string;
      title: string;
    }> = [];

    // Create URLs with exact format user provided
    const baseOptions = {
      limit: 10,
      offsetV2: null,
      shouldReturnDeserializedActivityItems: true,
      shouldIncludeRowActivityOrCommentUserObjById: true,
    };

    tickets.forEach((ticket) => {
      const requestId = `req${Date.now()}${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const secretSocketId = `soc${Date.now()}${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const params = new URLSearchParams({
        stringifiedObjectParams: JSON.stringify(baseOptions),
        requestId: requestId,
        secretSocketId: secretSocketId,
      });

      const url = `https://airtable.com/v0.3/row/${
        ticket.airtableRecordId
      }/readRowActivitiesAndComments?${params.toString()}`;

      urlList.push({
        recordId: ticket.airtableRecordId,
        url: url,
        baseId: ticket.baseId,
        tableId: ticket.tableId,
        title: (ticket as any).title || "No title",
      });
    });

    console.log(` Created ${urlList.length} URLs for processing`);

    // Show sample URLs
    console.log("\n Sample URLs:");
    urlList.slice(0, 2).forEach((item, index) => {
      console.log(`${index + 1}. Record: ${item.recordId}`);
      console.log(`   URL: ${item.url.substring(0, 100)}...`);
    });

    // STEP 4: Iterate through each record and hit endpoint
    console.log("\n⚡ STEP 4: Processing revision history for all records");
    console.log("-".repeat(40));

    const allRevisionHistory: RevisionChange[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process records with rate limiting
    for (let i = 0; i < urlList.length; i++) {
      const item = urlList[i];

      console.log(`\n Processing ${i + 1}/${urlList.length}: ${item.recordId}`);
      console.log(` Title: ${item.title}`);

      try {
        // Make request to Airtable endpoint with complete auth headers
        const completeAuthHeaders =
          EnhancedCookieValidator.buildCompleteAuthHeaders(
            cookies,
            localStorage,
            sessionData,
            item.baseId
          );

        const response = await axios.get(item.url, {
          headers: completeAuthHeaders,
          timeout: 30000,
        });

        console.log(` API Response received (Status: ${response.status})`);

        // STEP 5: Extract revision history in specified JSON format
        const revisions = parseRevisionHistoryResponse(
          response.data,
          item.recordId
        );

        if (revisions.length > 0) {
          console.log(` Found ${revisions.length} revision changes`);

          // Print revisions in requested format
          revisions.forEach((revision, revIndex) => {
            console.log(
              `   ${revIndex + 1}. ${revision.columnType}: "${
                revision.oldValue
              }" → "${revision.newValue}"`
            );
            console.log(
              `       ${revision.createdDate} by ${revision.authoredBy}`
            );
          });

          allRevisionHistory.push(...revisions);
          successCount++;
        } else {
          console.log("[INFO] No revision history found for this record");
          successCount++;
        }

        // Rate limiting - wait 1 second between requests
        if (i < urlList.length - 1) {
          console.log("[INFO] Waiting 1 second...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        failureCount++;
        console.error(
          ` Failed to process ${item.recordId}:`,
          (error as any).message
        );

        if ((error as any).response?.status === 401) {
          console.error(
            "[ERROR] Authentication failed - cookies may have expired"
          );
          break; // Stop processing if cookies are invalid
        }
      }
    }

    // STEP 6: Store in revision history collection
    console.log("\n STEP 6: Storing revision history in database");
    console.log("-".repeat(40));

    let savedCount = 0;

    if (allRevisionHistory.length > 0) {
      // Convert to database format and save
      const revisionDocs = allRevisionHistory.map((revision) => ({
        userId: userId,
        uuid: revision.uuid,
        issueId: revision.issueId,
        columnType: revision.columnType,
        oldValue: revision.oldValue,
        newValue: revision.newValue,
        createdDate: revision.createdDate,
        authoredBy: revision.authoredBy,
        extractedAt: new Date(),
      }));

      // Save to database (upsert to avoid duplicates)
      for (const doc of revisionDocs) {
        await RevisionHistory.findOneAndUpdate(
          {
            userId: doc.userId,
            uuid: doc.uuid,
            issueId: doc.issueId,
          },
          doc,
          { upsert: true, new: true }
        );
        savedCount++;
      }

      console.log(` Saved ${savedCount} revision history records to database`);
    }

    // STEP 7: Print final results in requested format
    console.log("\n AUTOMATION COMPLETE - FINAL RESULTS");
    console.log("=".repeat(60));

    console.log(` SUMMARY:`);
    console.log(`• Total tickets processed: ${urlList.length}`);
    console.log(`• Successful requests: ${successCount}`);
    console.log(`• Failed requests: ${failureCount}`);
    console.log(`• Total revision changes found: ${allRevisionHistory.length}`);
    console.log(`• Records saved to database: ${savedCount}`);

    // Print all results in exact format requested
    if (allRevisionHistory.length > 0) {
      console.log("\n ALL REVISION HISTORY IN REQUESTED FORMAT:");
      console.log("=".repeat(60));

      const formattedOutput = allRevisionHistory.map((revision) => ({
        uuid: revision.uuid,
        issueId: revision.issueId,
        columnType: revision.columnType,
        oldValue: revision.oldValue,
        newValue: revision.newValue,
        createdDate: revision.createdDate.toISOString(),
        authoredBy: revision.authoredBy,
      }));

      console.log(JSON.stringify(formattedOutput, null, 2));

      // Statistics by column type
      const statusChanges = formattedOutput.filter(
        (r) => r.columnType === "Status"
      ).length;
      const assigneeChanges = formattedOutput.filter(
        (r) => r.columnType === "Assignee"
      ).length;
      const otherChanges = formattedOutput.filter(
        (r) => r.columnType !== "Status" && r.columnType !== "Assignee"
      ).length;

      console.log("\n BREAKDOWN BY COLUMN TYPE:");
      console.log(`• Status Changes: ${statusChanges}`);
      console.log(`• Assignee Changes: ${assigneeChanges}`);
      console.log(`• Other Changes: ${otherChanges}`);
    }

    // Return API response
    res.status(200).json({
      success: true,
      message: "Bulk revision history automation completed",
      results: {
        totalTickets: urlList.length,
        successfulRequests: successCount,
        failedRequests: failureCount,
        totalRevisionChanges: allRevisionHistory.length,
        recordsSaved: savedCount,
        revisionHistory: allRevisionHistory.map((revision) => ({
          uuid: revision.uuid,
          issueId: revision.issueId,
          columnType: revision.columnType,
          oldValue: revision.oldValue,
          newValue: revision.newValue,
          createdDate: revision.createdDate.toISOString(),
          authoredBy: revision.authoredBy,
        })),
      },
    });
  } catch (error) {
    console.error("\n AUTOMATION FAILED:", (error as any).message);
    logger.error("Bulk revision history automation failed", error);

    const statusCode = (error as any).statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: (error as any).message,
      code: (error as any).code || "AUTOMATION_ERROR",
    });
  }
}

/**
 * Parse revision history response and extract data in requested format
 */
function parseRevisionHistoryResponse(
  responseData: any,
  recordId: string
): RevisionChange[] {
  const revisions: RevisionChange[] = [];

  try {
    console.log(" Parsing API response...");

    // The response structure may vary, so we need to handle different formats
    let activities = [];

    // Try different possible response structures
    if (responseData?.data?.results) {
      const results = responseData.data.results;
      if (Array.isArray(results) && results.length > 0) {
        const firstResult = results[0];
        if (firstResult.data?.activities) {
          activities = firstResult.data.activities;
        } else if (firstResult.data?.rowActivities) {
          const rowActivities = firstResult.data.rowActivities;
          const rowIds = Object.keys(rowActivities);
          if (rowIds.length > 0) {
            activities = rowActivities[rowIds[0]] || [];
          }
        }
      }
    } else if (responseData?.activities) {
      activities = responseData.activities;
    } else if (responseData?.data?.activities) {
      activities = responseData.data.activities;
    }

    console.log(` Found ${activities.length} activities in response`);

    // Process each activity
    for (const activity of activities) {
      // Only process field changes (Status and Assignee)
      const isFieldChange =
        activity.type === "updateCellValues" ||
        activity.activityType === "updateCellValues" ||
        activity.type === "fieldUpdate" ||
        activity.activityType === "fieldUpdate";

      if (!isFieldChange) {
        continue;
      }

      const cellChanges =
        activity.activityData?.cellValuesByColumnId ||
        activity.cellValuesByColumnId;

      if (!cellChanges) {
        continue;
      }

      // Process each changed column
      for (const [, change] of Object.entries(cellChanges)) {
        // Determine column type based on change data or common patterns
        const changeData = change as any;
        let columnType = "Unknown";

        // Try to determine if it's Status or Assignee based on the data
        if (changeData.prevValue?.name || changeData.newValue?.name) {
          // Likely a single select (Status)
          columnType = "Status";
        } else if (changeData.prevValue?.email || changeData.newValue?.email) {
          // Likely a collaborator (Assignee)
          columnType = "Assignee";
        } else if (
          Array.isArray(changeData.prevValue) ||
          Array.isArray(changeData.newValue)
        ) {
          // Could be multiple collaborators (Assignee) or multiple select
          columnType = "Assignee";
        }

        // Format old and new values
        const oldValue = formatFieldValue(changeData.prevValue, columnType);
        const newValue = formatFieldValue(changeData.newValue, columnType);

        // Only include Status and Assignee changes as specified
        if (columnType === "Status" || columnType === "Assignee") {
          revisions.push({
            uuid:
              activity.id ||
              `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            issueId: recordId,
            columnType: columnType,
            oldValue: oldValue,
            newValue: newValue,
            createdDate: new Date(
              activity.createdTime || activity.createdAt || Date.now()
            ),
            authoredBy:
              activity.originatingUserId || activity.authorId || "unknown",
          });
        }
      }
    }
  } catch (error) {
    console.error(" Error parsing response:", (error as any).message);
  }

  return revisions;
}

/**
 * Format field values based on type
 */
function formatFieldValue(value: any, columnType: string): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Handle different value types
  switch (columnType) {
    case "Status":
      // Single select
      if (value?.name) {
        return value.name;
      }
      return String(value);

    case "Assignee":
      // Collaborator fields
      if (value?.email) {
        return value.email;
      } else if (value?.name) {
        return value.name;
      } else if (Array.isArray(value)) {
        return value.map((v) => v?.email || v?.name || String(v)).join(", ");
      }
      return String(value);

    default:
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
      return String(value);
  }
}
