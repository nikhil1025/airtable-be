import { Request, Response } from "express";
import { RevisionHistory, Ticket } from "../models";
import { RevisionHistoryFetchService } from "../services/RevisionHistoryFetchService";
import { removeDuplicateRevisions } from "../utils/removeDuplicateRevisions";

/**
 * REVISION HISTORY FETCH CONTROLLER
 *
 * Handles API requests to fetch and store revision histories for a user
 */

/**
 * Fetch revision histories for a specific user
 *
 * GET /api/revision-history/fetch/:userId
 *
 * @param req - Request with userId in params
 * @param res - Response with array of all revision history records
 */
export const fetchRevisionHistoriesForUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(` FETCHING REVISION HISTORIES FOR USER: ${userId}`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Started at: ${new Date().toISOString()}\n`);

    // Create service instance
    const service = new RevisionHistoryFetchService(userId);

    // Fetch and store revision histories
    const revisions = await service.fetchAndStoreRevisionHistories();

    console.log(`\n${"=".repeat(70)}`);
    console.log(` FETCH COMPLETED - NOW CLEANING DUPLICATES`);
    console.log(`${"=".repeat(70)}\n`);

    // Remove duplicates for this user
    const cleanupStats = await removeDuplicateRevisions(userId);

    console.log(`\n${"=".repeat(70)}`);
    console.log(` CLEANUP COMPLETED SUCCESSFULLY`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Total Revisions: ${cleanupStats.totalRevisions}`);
    console.log(` Unique Groups: ${cleanupStats.uniqueGroups}`);
    console.log(` Duplicate Groups Found: ${cleanupStats.duplicateGroups}`);
    console.log(` Duplicates Removed: ${cleanupStats.duplicatesRemoved}`);
    console.log(` Affected Records: ${cleanupStats.affectedRecords}`);
    console.log(` Completed at: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(70)}\n`);

    // Fetch all revision histories for this user from DB (after cleanup)
    const allUserRevisions = await RevisionHistory.find({ userId })
      .sort({ createdDate: -1 })
      .lean();

    console.log(`\n${"=".repeat(70)}`);
    console.log(` DETAILED RESULTS`);
    console.log(`${"=".repeat(70)}\n`);

    // Group by issueId for display
    const groupedByIssue: { [key: string]: any[] } = {};

    allUserRevisions.forEach((rev) => {
      if (!groupedByIssue[rev.issueId]) {
        groupedByIssue[rev.issueId] = [];
      }
      groupedByIssue[rev.issueId].push({
        uuid: rev.uuid,
        issueId: rev.issueId,
        columnType: rev.columnType,
        oldValue: rev.oldValue,
        newValue: rev.newValue,
        createdDate: rev.createdDate,
        authoredBy: rev.authoredBy,
      });
    });

    // Display results
    let counter = 1;
    for (const [issueId, revisionItems] of Object.entries(groupedByIssue)) {
      if (revisionItems.length > 0) {
        console.log(
          `${counter}. ${issueId} - ${JSON.stringify(revisionItems)}`
        );
      } else {
        console.log(`${counter}. ${issueId} - null`);
      }
      counter++;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(` SCRAPING COMPLETED SUCCESSFULLY!`);
    console.log(`${"=".repeat(70)}\n`);

    // Send response
    res.status(200).json({
      success: true,
      message: `Successfully fetched and stored ${revisions.length} revision items (${cleanupStats.duplicatesRemoved} duplicates removed)`,
      data: {
        totalRevisions: allUserRevisions.length,
        totalTicketsWithRevisions: Object.keys(groupedByIssue).length,
        revisions: allUserRevisions,
        groupedByIssue: groupedByIssue,
        cleanupStats: {
          duplicatesRemoved: cleanupStats.duplicatesRemoved,
          duplicateGroupsFound: cleanupStats.duplicateGroups,
          affectedRecords: cleanupStats.affectedRecords,
        },
      },
    });
  } catch (error: any) {
    console.error("\n[ERROR] FETCHING REVISION HISTORIES:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch revision histories",
      error: error.message,
    });
  }
};

/**
 * Get all revision histories for a user from database
 *
 * GET /api/revision-history/user/:userId
 *
 * @param req - Request with userId in params
 * @param res - Response with array of all revision history records
 */
export const getRevisionHistoriesForUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    const revisions = await RevisionHistory.find({ userId })
      .sort({ createdDate: -1 })
      .lean();

    // Group by issueId
    const groupedByIssue: { [key: string]: any[] } = {};

    revisions.forEach((rev) => {
      if (!groupedByIssue[rev.issueId]) {
        groupedByIssue[rev.issueId] = [];
      }
      groupedByIssue[rev.issueId].push(rev);
    });

    res.status(200).json({
      success: true,
      data: {
        totalRevisions: revisions.length,
        totalTicketsWithRevisions: Object.keys(groupedByIssue).length,
        revisions: revisions,
        groupedByIssue: groupedByIssue,
      },
    });
  } catch (error: any) {
    console.error("Error fetching revision histories:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch revision histories from database",
      error: error.message,
    });
  }
};

/**
 * Get all revision histories as flat array (no grouping)
 *
 * GET /api/revision-history/all/:userId
 *
 * @param req - Request with userId in params
 * @param res - Response with flat array of all revision history records
 */
export const getAllRevisionsFlat = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const {
      limit,
      skip,
      sortBy = "createdDate",
      sortOrder = "desc",
    } = req.query;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    // Build query
    let query = RevisionHistory.find({ userId });

    // Apply sorting
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === "asc" ? 1 : -1;
    query = query.sort(sortOptions);

    // Apply pagination if provided
    if (skip) {
      query = query.skip(parseInt(skip as string));
    }
    if (limit) {
      query = query.limit(parseInt(limit as string));
    }

    const revisions = await query.lean();

    // Enrich revisions with baseId and tableId from tickets
    const uniqueIssueIds = [...new Set(revisions.map((r) => r.issueId))];
    const ticketLookup = await Ticket.find({
      airtableRecordId: { $in: uniqueIssueIds },
    })
      .select("airtableRecordId tableId baseId")
      .lean();

    const ticketMap = new Map(ticketLookup.map((t) => [t.airtableRecordId, t]));

    // Get unique ticket count
    const uniqueTickets = new Set(revisions.map((rev) => rev.issueId));

    res.status(200).json({
      success: true,
      data: {
        totalRevisions: revisions.length,
        totalTickets: uniqueTickets.size,
        revisions: revisions.map((rev) => {
          const ticket = ticketMap.get(rev.issueId);
          return {
            uuid: rev.uuid,
            issueId: rev.issueId,
            columnType: rev.columnType,
            oldValue: rev.oldValue,
            newValue: rev.newValue,
            createdDate: rev.createdDate,
            authoredBy: rev.authoredBy,
            authorName: rev.authorName,
            baseId: ticket?.baseId || rev.baseId,
            tableId: ticket?.tableId || rev.tableId,
            userId: rev.userId,
          };
        }),
      },
    });
  } catch (error: any) {
    console.error("Error fetching all revisions:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch revision histories from database",
      error: error.message,
    });
  }
};

/**
 * Get revision history for a specific record
 *
 * GET /api/revision-history/record/:recordId
 *
 * @param req - Request with recordId in params
 * @param res - Response with array of revision history for that record
 */
export const getRecordRevisions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { recordId } = req.params;
    const {
      userId,
      limit,
      sortBy = "createdDate",
      sortOrder = "desc",
    } = req.query;

    if (!recordId) {
      res.status(400).json({
        success: false,
        message: "recordId is required",
      });
      return;
    }

    // Build query
    const queryFilter: any = { issueId: recordId };
    if (userId) {
      queryFilter.userId = userId;
    }

    let query = RevisionHistory.find(queryFilter);

    // Apply sorting
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === "asc" ? 1 : -1;
    query = query.sort(sortOptions);

    // Apply limit if provided
    if (limit) {
      query = query.limit(parseInt(limit as string));
    }

    const revisions = await query.lean();

    // Enrich with baseId and tableId from ticket
    let enrichedBaseId = null;
    let enrichedTableId = null;

    if (revisions.length > 0) {
      const ticket = await Ticket.findOne({
        airtableRecordId: recordId,
      })
        .select("tableId baseId")
        .lean();

      if (ticket) {
        enrichedBaseId = ticket.baseId;
        enrichedTableId = ticket.tableId;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        recordId: recordId,
        totalRevisions: revisions.length,
        revisions: revisions.map((rev) => ({
          uuid: rev.uuid,
          issueId: rev.issueId,
          columnType: rev.columnType,
          oldValue: rev.oldValue,
          newValue: rev.newValue,
          createdDate: rev.createdDate,
          authoredBy: rev.authoredBy,
          authorName: rev.authorName,
          baseId: enrichedBaseId || rev.baseId,
          tableId: enrichedTableId || rev.tableId,
          userId: rev.userId,
        })),
      },
    });
  } catch (error: any) {
    console.error("Error fetching record revisions:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch revision history for record",
      error: error.message,
    });
  }
};

/**
 * Get revision histories by baseId and/or tableId
 *
 * GET /api/revision-history/filter
 *
 * @param req - Request with baseId and/or tableId in query params
 * @param res - Response with array of revision histories
 */
export const getRevisionsByFilter = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      baseId,
      tableId,
      userId,
      limit,
      skip,
      sortBy = "createdDate",
      sortOrder = "desc",
    } = req.query;

    // userId is required for filtering
    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    console.log(
      `\n🔍 Filtering revisions with filters:`,
      JSON.stringify({ userId, baseId, tableId }, null, 2)
    );

    let recordIds: string[] = [];

    // Step 1: If filtering by baseId or tableId, find matching tickets first
    if (baseId || tableId) {
      const ticketFilter: any = { userId };
      if (baseId) ticketFilter.baseId = baseId;
      if (tableId) ticketFilter.tableId = tableId;

      console.log(`📋 Finding tickets with filter:`, ticketFilter);

      const tickets = await Ticket.find(ticketFilter)
        .select("airtableRecordId")
        .lean();

      recordIds = tickets.map((t) => t.airtableRecordId);

      console.log(
        `✅ Found ${recordIds.length} tickets matching baseId/tableId filter`
      );

      if (recordIds.length === 0) {
        // No tickets match the filter, return empty result
        res.status(200).json({
          success: true,
          data: {
            filters: {
              baseId: baseId || null,
              tableId: tableId || null,
              userId: userId || null,
            },
            totalRevisions: 0,
            totalTickets: 0,
            stats: {
              totalChanges: 0,
              statusChanges: 0,
              assigneeChanges: 0,
            },
            revisions: [],
          },
        });
        return;
      }
    }

    // Step 2: Build query for revisions
    const queryFilter: any = { userId };

    if (recordIds.length > 0) {
      // Filter by the recordIds we found from tickets
      queryFilter.issueId = { $in: recordIds };
    }

    console.log(
      `🔎 Querying revisions with filter (showing first 100 chars):`,
      JSON.stringify(queryFilter, null, 2).substring(0, 100)
    );

    // Build query
    let query = RevisionHistory.find(queryFilter);

    // Apply sorting
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === "asc" ? 1 : -1;
    query = query.sort(sortOptions);

    // Apply pagination if provided
    if (skip) {
      query = query.skip(parseInt(skip as string));
    }
    if (limit) {
      query = query.limit(parseInt(limit as string));
    }

    const revisions = await query.lean();

    console.log(`📦 Found ${revisions.length} revisions`);

    // Step 3: Enrich revisions with baseId and tableId by looking up tickets
    const uniqueIssueIds = [...new Set(revisions.map((r) => r.issueId))];
    const ticketLookup = await Ticket.find({
      airtableRecordId: { $in: uniqueIssueIds },
    })
      .select("airtableRecordId tableId baseId")
      .lean();

    // Create lookup map
    const ticketMap = new Map(ticketLookup.map((t) => [t.airtableRecordId, t]));

    console.log(
      `🔗 Enriching ${revisions.length} revisions with baseId/tableId from ${ticketLookup.length} tickets`
    );

    // Get unique ticket count
    const uniqueTickets = new Set(revisions.map((rev) => rev.issueId));

    // Calculate stats for frontend
    const totalChanges = revisions.length;
    const statusChanges = revisions.filter(
      (rev) => rev.columnType === "Status"
    ).length;
    const assigneeChanges = revisions.filter(
      (rev) => rev.columnType === "Assignee"
    ).length;

    console.log(
      `📊 Stats: Total=${totalChanges}, Status=${statusChanges}, Assignee=${assigneeChanges}, Tickets=${uniqueTickets.size}`
    );

    res.status(200).json({
      success: true,
      data: {
        filters: {
          baseId: baseId || null,
          tableId: tableId || null,
          userId: userId || null,
        },
        totalRevisions: revisions.length,
        totalTickets: uniqueTickets.size,
        stats: {
          totalChanges,
          statusChanges,
          assigneeChanges,
        },
        revisions: revisions.map((rev) => {
          const ticket = ticketMap.get(rev.issueId);
          return {
            uuid: rev.uuid,
            issueId: rev.issueId,
            columnType: rev.columnType,
            oldValue: rev.oldValue,
            newValue: rev.newValue,
            createdDate: rev.createdDate,
            authoredBy: rev.authoredBy,
            authorName: rev.authorName,
            baseId: ticket?.baseId || rev.baseId,
            tableId: ticket?.tableId || rev.tableId,
            userId: rev.userId,
          };
        }),
      },
    });
  } catch (error: any) {
    console.error("Error fetching filtered revisions:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch revision histories from database",
      error: error.message,
    });
  }
};

/**
 * Scrape revision history for a single record
 *
 * POST /api/revision-history/scrape/record
 *
 * @param req - Request with userId, recordId, baseId, tableId in body
 * @param res - Response with scraped revision history
 */
export const scrapeSingleRecord = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId, recordId, baseId, tableId } = req.body;

    if (!userId || !recordId || !baseId || !tableId) {
      res.status(400).json({
        success: false,
        message: "userId, recordId, baseId, and tableId are required",
      });
      return;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(` SCRAPING SINGLE RECORD REVISION HISTORY`);
    console.log(`${"".repeat(70)}`);
    console.log(`[INFO] User ID: ${userId}`);
    console.log(` Record ID: ${recordId}`);
    console.log(` Base ID: ${baseId}`);
    console.log(` Table ID: ${tableId}`);
    console.log(` Started at: ${new Date().toISOString()}\n`);

    // Create service instance
    const service = new RevisionHistoryFetchService(userId);

    // Scrape single record
    const revisions = await service.scrapeSingleRecord(recordId, baseId);

    console.log(`\n${"=".repeat(70)}`);
    console.log(` SCRAPING COMPLETED SUCCESSFULLY`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Total Revision Items: ${revisions.length}`);
    console.log(` Completed at: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(70)}\n`);

    res.status(200).json({
      success: true,
      message: `Successfully scraped ${revisions.length} revision items for record ${recordId}`,
      data: {
        recordId: recordId,
        totalRevisions: revisions.length,
        revisions: revisions.map((rev) => ({
          uuid: rev.uuid,
          issueId: rev.issueId,
          columnType: rev.columnType,
          oldValue: rev.oldValue,
          newValue: rev.newValue,
          createdDate: rev.createdDate,
          authoredBy: rev.authoredBy,
        })),
      },
    });
  } catch (error: any) {
    console.error("\n[ERROR] SCRAPING SINGLE RECORD:", error);
    res.status(500).json({
      success: false,
      message: "Failed to scrape revision history for record",
      error: error.message,
    });
  }
};

/**
 * Clean up duplicate revision history records for a user
 *
 * POST /api/revision-history/cleanup/:userId
 *
 * Removes duplicate records based on matching newValue, oldValue, and createdDate.
 * Keeps only one record when duplicates are found.
 *
 * @param req - Request with userId in params
 * @param res - Response with cleanup statistics
 */
export const cleanupDuplicates = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(` CLEANUP DUPLICATES FOR USER: ${userId}`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Started at: ${new Date().toISOString()}\n`);

    // Create service instance
    const service = new RevisionHistoryFetchService(userId);

    // Run cleanup
    const result = await service.cleanupDuplicates();

    console.log(` Completed at: ${new Date().toISOString()}\n`);

    res.status(200).json({
      success: true,
      message: `Cleanup completed: ${result.duplicatesRemoved} duplicates removed`,
      data: {
        totalChecked: result.totalChecked,
        duplicatesRemoved: result.duplicatesRemoved,
        groupsProcessed: result.groupsProcessed,
        remainingRecords: result.totalChecked - result.duplicatesRemoved,
      },
    });
  } catch (error: any) {
    console.error("\n[ERROR] CLEANUP DUPLICATES:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup duplicate revision histories",
      error: error.message,
    });
  }
};

/**
 * Sync (scrape + cleanup duplicates) revision history for a single record
 *
 * POST /api/revision-history/sync/record
 *
 * This endpoint:
 * 1. Scrapes revision history for the specific record
 * 2. Automatically cleans up duplicate revisions for that record
 * 3. Returns the cleaned revision history
 *
 * @param req - Request with userId, recordId, baseId, tableId in body
 * @param res - Response with synced and cleaned revision history
 */
export const syncSingleRecord = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId, recordId, baseId, tableId } = req.body;

    if (!userId || !recordId || !baseId || !tableId) {
      res.status(400).json({
        success: false,
        message: "userId, recordId, baseId, and tableId are required",
      });
      return;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(` SYNCING SINGLE RECORD REVISION HISTORY`);
    console.log(`${"=".repeat(70)}`);
    console.log(` User ID: ${userId}`);
    console.log(` Record ID: ${recordId}`);
    console.log(` Base ID: ${baseId}`);
    console.log(` Table ID: ${tableId}`);
    console.log(` Started at: ${new Date().toISOString()}\n`);

    // Step 0: Delete existing revisions for this record to prevent duplicates
    console.log(`\n${"=".repeat(70)}`);
    console.log(` STEP 0: REMOVING EXISTING REVISIONS`);
    console.log(`${"=".repeat(70)}\n`);

    const existingRevisions = await RevisionHistory.find({
      issueId: recordId,
      userId: userId,
    });

    console.log(`📊 Found ${existingRevisions.length} existing revisions`);

    if (existingRevisions.length > 0) {
      const deleteResult = await RevisionHistory.deleteMany({
        issueId: recordId,
        userId: userId,
      });
      console.log(
        `🗑️  Deleted ${deleteResult.deletedCount} existing revisions\n`
      );
    } else {
      console.log(`✓ No existing revisions to delete\n`);
    }

    // Step 1: Create service instance and scrape the record
    const service = new RevisionHistoryFetchService(userId);

    console.log(`\n${"=".repeat(70)}`);
    console.log(` STEP 1: SCRAPING RECORD REVISION HISTORY`);
    console.log(`${"=".repeat(70)}\n`);

    const revisions = await service.scrapeSingleRecord(recordId, baseId);

    console.log(
      `✅ Scraped ${revisions.length} revision items for record ${recordId}\n`
    );

    // Step 2: Clean up any duplicates that might have been created during scraping
    console.log(`\n${"=".repeat(70)}`);
    console.log(` STEP 2: CLEANING UP DUPLICATE REVISIONS`);
    console.log(`${"=".repeat(70)}\n`);

    // Remove duplicates for this specific record only
    const cleanupStats = await removeDuplicateRevisions(userId, recordId);

    console.log(`\n${"=".repeat(70)}`);
    console.log(` CLEANUP COMPLETED`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Total Revisions Checked: ${cleanupStats.totalRevisions}`);
    console.log(` Duplicate Groups Found: ${cleanupStats.duplicateGroups}`);
    console.log(` Duplicates Removed: ${cleanupStats.duplicatesRemoved}`);
    console.log(`${"=".repeat(70)}\n`);

    // Step 3: Fetch final cleaned revisions
    const finalRevisions = await RevisionHistory.find({
      issueId: recordId,
      userId: userId,
    })
      .sort({ createdDate: -1 })
      .lean();

    console.log(`\n${"=".repeat(70)}`);
    console.log(` SYNC COMPLETED SUCCESSFULLY`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Final Revision Count: ${finalRevisions.length}`);
    console.log(` Completed at: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(70)}\n`);

    res.status(200).json({
      success: true,
      message: `Successfully synced revision history for record ${recordId}`,
      data: {
        recordId: recordId,
        totalRevisions: finalRevisions.length,
        duplicatesRemoved: cleanupStats.duplicatesRemoved,
        revisions: finalRevisions.map((rev) => ({
          uuid: rev.uuid,
          issueId: rev.issueId,
          columnType: rev.columnType,
          oldValue: rev.oldValue,
          newValue: rev.newValue,
          createdDate: rev.createdDate,
          authoredBy: rev.authoredBy,
          authorName: rev.authorName,
        })),
      },
    });
  } catch (error: any) {
    console.error("\n[ERROR] SYNCING SINGLE RECORD:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync revision history for record",
      error: error.message,
    });
  }
};
