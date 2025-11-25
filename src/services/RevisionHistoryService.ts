import axios from "axios";
import config from "../config";
import { RevisionHistory, Ticket } from "../models";
import {
  BatchProcessResult,
  RevisionChange,
  RevisionHistoryResponse,
  SyncRevisionHistoryResponse,
} from "../types";
import { AppError, handleScrapingError, logger } from "../utils/errors";
import { chunkArray, delay } from "../utils/helpers";
import {
  filterStatusAndAssigneeChanges,
  parseRevisionHistoryHTML,
} from "../utils/htmlParser";
import CookieScraperService from "./CookieScraperService";

export class RevisionHistoryService {
  /**
   * Fetches revision history for a single ticket using Puppeteer web scraping
   * NOTE: Airtable does NOT have a public API for revision history
   * This requires scraping the web interface directly
   */
  async fetchRevisionHistory(
    userId: string,
    baseId: string,
    tableId: string,
    recordId: string,
    rowId: string
  ): Promise<RevisionHistoryResponse> {
    try {
      logger.info("Fetching revision history via web scraping", {
        userId,
        recordId,
      });

      // Get cookies for authentication
      const cookiesData = await CookieScraperService.getCookiesFromDB(userId);
      if (!cookiesData || cookiesData.length === 0) {
        throw new AppError(
          "No cookies found for user - please login first",
          401,
          "NO_COOKIES"
        );
      }

      // Use Worker Pool to scrape revision history
      const workerPool = CookieScraperService.getWorkerPoolInstance();

      const result = await workerPool.execute<{
        success: boolean;
        html?: string;
        revisions?: any[];
        recordUrl?: string;
        error?: string;
      }>({
        type: "scrapeRevisionHistory",
        data: {
          baseId,
          tableId,
          recordId,
          rowId,
          cookies: cookiesData,
        },
      });

      if (!result.success) {
        throw new AppError(
          result.error || "Failed to scrape revision history",
          500,
          "SCRAPING_FAILED"
        );
      }

      // Parse the HTML to extract revision changes
      let parsedRevisions: RevisionChange[] = [];
      
      if (result.html) {
        parsedRevisions = parseRevisionHistoryHTML(result.html);
      }

      // If we got structured data from the page, use it to enhance parsed data
      if (result.revisions && result.revisions.length > 0) {
        logger.info("Extracted revisions from DOM", {
          count: result.revisions.length,
        });
      }

      logger.info("Revision history fetched successfully", {
        recordId,
        revisionsCount: parsedRevisions.length,
      });

      return {
        success: true,
        revisions: parsedRevisions,
        message: `Fetched ${parsedRevisions.length} revision(s)`,
      };
    } catch (error) {
      logger.error("Failed to fetch revision history", error, {
        userId,
        recordId,
      });
      throw handleScrapingError(error);
    }
  }

  /**
   * DEPRECATED: Old method that tried to use non-existent endpoint
   * Kept for reference but not used
   */
  async fetchRevisionHistoryViaEndpoint(
    userId: string,
    baseId: string,
    tableId: string,
    recordId: string,
    rowId: string
  ): Promise<RevisionHistoryResponse> {
    try {
      logger.info("Fetching revision history for ticket", {
        userId,
        recordId,
        rowId,
      });

      // Get valid cookies
      const cookiesString = await CookieScraperService.getValidCookies(userId);
      const cookies = JSON.parse(cookiesString);

      // Build cookie header
      const cookieHeader = cookies
        .map(
          (cookie: { name: string; value: string }) =>
            `${cookie.name}=${cookie.value}`
        )
        .join("; ");

      // Make request to /readRowActivitiesAndComments endpoint
      // WARNING: This endpoint does NOT exist - will always return 404
      // This is kept for reference only
      const url = `${config.airtable.webUrl}/readRowActivitiesAndComments`;

      logger.info("Making revision history request", {
        url,
        baseId,
        tableId,
        recordId,
        rowId,
      });

      const response = await axios.post(
        url,
        {
          baseId,
          tableId,
          recordId,
          rowId,
        },
        {
          headers: {
            Cookie: cookieHeader,
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "*/*",
            Referer: `${config.airtable.webUrl}/${baseId}/${tableId}`,
            Origin: config.airtable.webUrl,
          },
          timeout: 10000,
        }
      );

      logger.info("Revision history response received", {
        recordId,
        statusCode: response.status,
        dataType: typeof response.data,
      });

      // Parse HTML response
      const html =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      const allRevisions = parseRevisionHistoryHTML(html);

      // Filter for Status and Assignee changes only
      const filteredRevisions = filterStatusAndAssigneeChanges(allRevisions);

      // Store revisions in database
      for (const revision of filteredRevisions) {
        await RevisionHistory.findOneAndUpdate(
          { uuid: revision.uuid },
          {
            uuid: revision.uuid,
            issueId: recordId,
            columnType: revision.columnType,
            oldValue: revision.oldValue,
            newValue: revision.newValue,
            createdDate: revision.createdDate,
            authoredBy: revision.authoredBy,
            userId,
            updatedAt: new Date(),
          },
          { upsert: true, new: true }
        );
      }

      logger.info("Revision history fetched and stored", {
        userId,
        recordId,
        count: filteredRevisions.length,
      });

      return {
        success: true,
        revisions: filteredRevisions,
      };
    } catch (error) {
      logger.error("Failed to fetch revision history", error, {
        userId,
        recordId,
      });
      throw handleScrapingError(error);
    }
  }

  /**
   * Syncs revision history for all tickets (with batch processing)
   */
  async syncRevisionHistory(
    userId: string,
    baseId?: string,
    tableId?: string
  ): Promise<SyncRevisionHistoryResponse> {
    try {
      logger.info("Starting revision history sync", {
        userId,
        baseId,
        tableId,
      });

      // Build query for tickets
      const query: Record<string, string> = { userId };
      if (baseId) query.baseId = baseId;
      if (tableId) query.tableId = tableId;

      // Fetch all tickets matching criteria
      const tickets = await Ticket.find(query);

      if (tickets.length === 0) {
        logger.info("No tickets found for sync", { userId, baseId, tableId });
        return {
          success: true,
          processed: 0,
          synced: 0,
          failed: 0,
          errors: [],
        };
      }

      logger.info("Found tickets to process", { count: tickets.length });

      // Process tickets in batches
      const batchSize = 50;
      const batches = chunkArray(tickets, batchSize);

      let totalProcessed = 0;
      let totalSynced = 0;
      let totalFailed = 0;
      const errors: Array<{ recordId: string; error: string }> = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.info("Processing batch", {
          batchNumber: i + 1,
          totalBatches: batches.length,
          batchSize: batch.length,
        });

        const batchResult = await this.processTicketBatch(batch, userId);

        totalProcessed += batchResult.processed;
        totalSynced += batchResult.successful;
        totalFailed += batchResult.failed;

        // Convert errors from { id, error } to { recordId, error }
        const convertedErrors = batchResult.errors.map((e) => ({
          recordId: e.id,
          error: e.error,
        }));
        errors.push(...convertedErrors);

        // Add delay between batches to avoid overwhelming the server
        if (i < batches.length - 1) {
          await delay(1000);
        }
      }

      logger.info("Revision history sync completed", {
        userId,
        totalProcessed,
        totalSynced,
        totalFailed,
      });

      return {
        success: true,
        processed: totalProcessed,
        synced: totalSynced,
        failed: totalFailed,
        errors,
      };
    } catch (error) {
      logger.error("Failed to sync revision history", error, { userId });
      throw handleScrapingError(error);
    }
  }

  /**
   * Processes a batch of tickets for revision history
   */
  async processTicketBatch(
    tickets: Array<{
      airtableRecordId: string;
      baseId: string;
      tableId: string;
      rowId: string;
    }>,
    userId: string
  ): Promise<BatchProcessResult> {
    let processed = 0;
    let successful = 0;
    let failed = 0;
    const errors: Array<{ recordId: string; error: string }> = [];

    for (const ticket of tickets) {
      try {
        processed++;

        await this.fetchRevisionHistory(
          userId,
          ticket.baseId,
          ticket.tableId,
          ticket.airtableRecordId,
          ticket.rowId
        );

        successful++;

        // Small delay between requests to avoid rate limiting
        await delay(200);
      } catch (error) {
        failed++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({
          recordId: ticket.airtableRecordId,
          error: errorMessage,
        });

        logger.warn("Failed to process ticket in batch", {
          recordId: ticket.airtableRecordId,
          error: errorMessage,
        });
      }
    }

    return {
      processed,
      successful,
      failed,
      errors: errors.map((e) => ({ id: e.recordId, error: e.error })),
    };
  }

  /**
   * Gets stored revision history for a ticket
   */
  async getRevisionHistoryForTicket(
    ticketId: string,
    userId: string
  ): Promise<RevisionChange[]> {
    try {
      const revisions = await RevisionHistory.find({
        issueId: ticketId,
        userId,
      }).sort({ createdDate: -1 });

      return revisions.map((rev) => ({
        uuid: rev.uuid,
        issueId: rev.issueId,
        columnType: rev.columnType,
        oldValue: rev.oldValue,
        newValue: rev.newValue,
        createdDate: rev.createdDate,
        authoredBy: rev.authoredBy,
      }));
    } catch (error) {
      logger.error("Failed to get revision history", error, {
        ticketId,
        userId,
      });
      throw new AppError(
        "Failed to retrieve revision history",
        500,
        "DATABASE_ERROR"
      );
    }
  }

  /**
   * Checks if cookies are valid before sync
   */
  async ensureValidCookies(userId: string): Promise<boolean> {
    try {
      const isValid = await CookieScraperService.validateCookies(userId);

      if (!isValid) {
        throw new AppError(
          "Cookies are invalid or expired. Please refresh cookies before syncing revision history.",
          401,
          "COOKIES_INVALID"
        );
      }

      return true;
    } catch (error) {
      logger.error("Cookie validation failed", error, { userId });
      throw error;
    }
  }
}

export default new RevisionHistoryService();
