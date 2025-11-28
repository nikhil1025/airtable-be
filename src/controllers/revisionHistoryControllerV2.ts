import { NextFunction, Request, Response } from "express";
import path from "path";
import { Ticket } from "../models";
import RevisionHistory from "../models/RevisionHistory";
import { CookieScraperService } from "../services/CookieScraperService";
import { AppError } from "../utils/errors";
import { WorkerPool } from "../workers/WorkerPool";

/**
 * Revision History Controller - NEW IMPLEMENTATION
 * Uses internal Airtable API for fetching revision history
 */
export class RevisionHistoryControllerV2 {
  private static workerPool: WorkerPool | null = null;

  /**
   * Get or create worker pool
   */
  private static getWorkerPool(): WorkerPool {
    if (!this.workerPool) {
      const workerPath = path.resolve(
        __dirname,
        "../workers/puppeteerWorker.ts"
      );
      this.workerPool = new WorkerPool(workerPath, 2);
    }
    return this.workerPool;
  }

  /**
   * POST /api/revision-history/fetch-single
   * Fetch revision history for a single ticket
   */
  static async fetchSingle(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, recordId, viewId } = req.body;

      if (!userId || !recordId) {
        throw new AppError(
          "userId and recordId are required",
          400,
          "MISSING_PARAMS"
        );
      }

      // Validate cookies first
      const isValid = await CookieScraperService.validateCookies(userId);
      if (!isValid) {
        throw new AppError(
          "Cookies are invalid or expired. Please refresh cookies using /api/airtable/cookies/auto-retrieve",
          401,
          "COOKIES_INVALID"
        );
      }

      // Get ticket
      const ticket = await Ticket.findOne({
        userId,
        airtableRecordId: recordId,
      });
      if (!ticket) {
        throw new AppError(
          `Ticket ${recordId} not found`,
          404,
          "TICKET_NOT_FOUND"
        );
      }

      // Get cookies
      const cookies = await CookieScraperService.getCookiesFromDB(userId);

      // Fetch revision history using worker
      const workerPool = RevisionHistoryControllerV2.getWorkerPool();
      const result: any = await workerPool.execute({
        type: "scrapeRevisionHistory",
        data: {
          baseId: ticket.baseId,
          tableId: ticket.tableId,
          recordId: ticket.airtableRecordId,
          rowId: ticket.rowId,
          viewId,
          cookies,
        },
      });

      if (!result.success) {
        if (result.needsReauth) {
          throw new AppError(
            "Authentication failed - cookies expired",
            401,
            "COOKIES_EXPIRED"
          );
        }
        throw new AppError(
          result.error || "Failed to fetch revision history",
          500,
          "FETCH_FAILED"
        );
      }

      // Store revisions in database
      const revisions = result.revisions || [];
      let savedCount = 0;

      for (const revision of revisions) {
        try {
          await RevisionHistory.findOneAndUpdate(
            { uuid: revision.uuid },
            {
              ...revision,
              userId,
              baseId: ticket.baseId,
              tableId: ticket.tableId,
            },
            { upsert: true, new: true }
          );
          savedCount++;
        } catch (error: any) {
          console.error(
            `Error saving revision ${revision.uuid}:`,
            error.message
          );
        }
      }

      res.json({
        success: true,
        recordId: ticket.airtableRecordId,
        totalRevisions: revisions.length,
        savedRevisions: savedCount,
        revisions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/revision-history/fetch-batch
   * Fetch revision history for all tickets (batch processing)
   */
  static async fetchBatch(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, viewId, batchSize = 10, delayMs = 2000 } = req.body;

      if (!userId) {
        throw new AppError("userId is required", 400, "MISSING_USER_ID");
      }

      // Validate cookies first
      const isValid = await CookieScraperService.validateCookies(userId);
      if (!isValid) {
        throw new AppError(
          "Cookies are invalid or expired. Please refresh cookies first.",
          401,
          "COOKIES_INVALID"
        );
      }

      // Get all tickets
      const tickets = await Ticket.find({ userId });
      console.log(`[BATCH_PROCESS] Found ${tickets.length} tickets to process`);

      if (tickets.length === 0) {
        res.json({
          success: true,
          message: "No tickets found to process",
          totalTickets: 0,
          processedTickets: 0,
          totalRevisions: 0,
          errors: 0,
        });
        return;
      }

      let processedTickets = 0;
      let totalRevisions = 0;
      let errors = 0;
      const errorDetails: any[] = [];

      // Get cookies once
      const cookies = await CookieScraperService.getCookiesFromDB(userId);
      const workerPool = RevisionHistoryControllerV2.getWorkerPool();

      // Process in batches
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        console.log(
          `[BATCH_PROCESS] Processing batch ${
            Math.floor(i / batchSize) + 1
          }/${Math.ceil(tickets.length / batchSize)}`
        );

        // Process batch concurrently
        const batchPromises = batch.map(async (ticket) => {
          try {
            const result: any = await workerPool.execute({
              type: "scrapeRevisionHistory",
              data: {
                baseId: ticket.baseId,
                tableId: ticket.tableId,
                recordId: ticket.airtableRecordId,
                rowId: ticket.rowId,
                viewId,
                cookies,
              },
            });

            if (!result.success) {
              if (result.needsReauth) {
                throw new Error("COOKIES_EXPIRED");
              }
              throw new Error(result.error || "Unknown error");
            }

            // Store revisions
            const revisions = result.revisions || [];
            let savedCount = 0;

            for (const revision of revisions) {
              try {
                await RevisionHistory.findOneAndUpdate(
                  { uuid: revision.uuid },
                  {
                    ...revision,
                    userId,
                    baseId: ticket.baseId,
                    tableId: ticket.tableId,
                  },
                  { upsert: true, new: true }
                );
                savedCount++;
              } catch (err: any) {
                console.error(`Error saving revision:`, err.message);
              }
            }

            return {
              success: true,
              count: savedCount,
              recordId: ticket.airtableRecordId,
            };
          } catch (error: any) {
            return {
              success: false,
              error: error.message,
              recordId: ticket.airtableRecordId,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);

        // Aggregate results
        for (const result of batchResults) {
          if (result.success) {
            processedTickets++;
            totalRevisions += result.count || 0;
          } else {
            errors++;
            errorDetails.push({
              recordId: result.recordId,
              error: result.error,
            });

            // Stop if cookies expired
            if (result.error?.includes("COOKIES_EXPIRED")) {
              throw new AppError(
                "Cookies expired during processing. Please refresh cookies and restart.",
                401,
                "COOKIES_EXPIRED"
              );
            }
          }
        }

        // Delay between batches
        if (i + batchSize < tickets.length) {
          console.log(
            `[BATCH_PROCESS] Waiting ${delayMs}ms before next batch...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      res.json({
        success: true,
        totalTickets: tickets.length,
        processedTickets,
        totalRevisions,
        errors,
        errorDetails: errorDetails.slice(0, 10), // Return first 10 errors
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/revision-history/statistics/:userId
   * Get statistics about stored revision history
   */
  static async getStatistics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.params;

      const totalRevisions = await RevisionHistory.countDocuments({ userId });
      const statusChanges = await RevisionHistory.countDocuments({
        userId,
        columnType: /status/i,
      });
      const assigneeChanges = await RevisionHistory.countDocuments({
        userId,
        columnType: /assign/i,
      });

      const recentRevisions = await RevisionHistory.find({ userId })
        .sort({ createdDate: -1 })
        .limit(10)
        .select("issueId columnType oldValue newValue createdDate authorName");

      res.json({
        success: true,
        totalRevisions,
        statusChanges,
        assigneeChanges,
        recentRevisions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cleanup worker pool on shutdown
   */
  static cleanup(): void {
    if (this.workerPool) {
      this.workerPool.terminate();
      this.workerPool = null;
    }
  }
}
