import { Request, Response } from "express";
import { RevisionHistory } from "../models";
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

    // Get unique ticket count
    const uniqueTickets = new Set(revisions.map((rev) => rev.issueId));

    res.status(200).json({
      success: true,
      data: {
        totalRevisions: revisions.length,
        totalTickets: uniqueTickets.size,
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

    // At least one filter parameter is required
    if (!baseId && !tableId) {
      res.status(400).json({
        success: false,
        message: "At least one of baseId or tableId is required",
      });
      return;
    }

    // Build query filter
    const queryFilter: any = {};
    if (baseId) {
      queryFilter.baseId = baseId;
    }
    if (tableId) {
      queryFilter.tableId = tableId;
    }
    if (userId) {
      queryFilter.userId = userId;
    }

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

    // Get unique ticket count
    const uniqueTickets = new Set(revisions.map((rev) => rev.issueId));

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
    const revisions = await service.scrapeSingleRecord(
      recordId,
      baseId,
      tableId
    );

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
