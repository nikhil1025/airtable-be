import { Request, Response } from "express";
import { RevisionHistory } from "../models";
import { RevisionHistoryFetchService } from "../services/RevisionHistoryFetchService";

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
    console.log(`🚀 FETCHING REVISION HISTORIES FOR USER: ${userId}`);
    console.log(`${"=".repeat(70)}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

    // Create service instance
    const service = new RevisionHistoryFetchService(userId);

    // Fetch and store revision histories
    const revisions = await service.fetchAndStoreRevisionHistories();

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ FETCH COMPLETED SUCCESSFULLY`);
    console.log(`${"=".repeat(70)}`);
    console.log(`📊 Total Revision Items Stored: ${revisions.length}`);
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(70)}\n`);

    // Fetch all revision histories for this user from DB
    const allUserRevisions = await RevisionHistory.find({ userId })
      .sort({ createdDate: -1 })
      .lean();

    console.log(`\n${"=".repeat(70)}`);
    console.log(`📋 DETAILED RESULTS`);
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
    console.log(`✅ SCRAPING COMPLETED SUCCESSFULLY!`);
    console.log(`${"=".repeat(70)}\n`);

    // Send response
    res.status(200).json({
      success: true,
      message: `Successfully fetched and stored ${revisions.length} revision items`,
      data: {
        totalRevisions: allUserRevisions.length,
        totalTicketsWithRevisions: Object.keys(groupedByIssue).length,
        revisions: allUserRevisions,
        groupedByIssue: groupedByIssue,
      },
    });
  } catch (error: any) {
    console.error("\n💥 ERROR FETCHING REVISION HISTORIES:", error);

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
