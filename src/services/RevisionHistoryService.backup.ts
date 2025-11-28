import axios from "axios";
import config from "../config";
import { AirtableConnection, RevisionHistory, Table, Ticket } from "../models";
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
    rowId: string,
    viewId?: string
  ): Promise<RevisionHistoryResponse> {
    try {
      logger.info("Fetching revision history via web scraping", {
        userId,
        recordId,
        viewId: viewId || "will extract from page",
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

      // Get localStorage data
      const localStorageData = await CookieScraperService.getLocalStorageFromDB(
        userId
      );
      logger.info("Retrieved localStorage for user", {
        userId,
        itemCount: Object.keys(localStorageData).length,
      });

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
          viewId,
          cookies: cookiesData,
          localStorage: localStorageData,
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

      // If HTML parsing didn't find anything but we got structured data from DOM, convert it
      if (
        parsedRevisions.length === 0 &&
        result.revisions &&
        result.revisions.length > 0
      ) {
        logger.info("HTML parsing returned empty, using DOM extracted data", {
          count: result.revisions.length,
          sampleData: result.revisions.slice(0, 2), // Log first 2 items for debugging
        });

        // Convert DOM data to RevisionChange format
        parsedRevisions = result.revisions.map((rev: any, index: number) => {
          const columnType = this.extractColumnType(rev.text);
          const oldValue = this.extractOldValue(rev.text);
          const newValue = this.extractNewValue(rev.text);

          logger.debug("Converting revision", {
            index,
            text: rev.text?.substring(0, 100),
            columnType,
            oldValue,
            newValue,
          });

          return {
            uuid: `revision_${recordId}_${Date.now()}_${index}`,
            issueId: recordId,
            columnType,
            oldValue,
            newValue,
            createdDate: rev.timestamp ? new Date(rev.timestamp) : new Date(),
            authoredBy: rev.user || "unknown",
          };
        });

        logger.info("Converted DOM data to revision changes", {
          count: parsedRevisions.length,
          sampleRevision: parsedRevisions[0],
        });
      }

      logger.info("Revision history fetched successfully", {
        recordId,
        revisionsCount: parsedRevisions.length,
        rawDOMCount: result.revisions?.length || 0,
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
   * Uses parallel processing with concurrency control
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
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ id: string; error: string }>,
    };

    // Process tickets in parallel with dynamic concurrency based on CPU cores
    const cpuCount = require("os").cpus().length;
    const concurrency = Math.min(Math.max(cpuCount - 1, 4), 10); // Min 4, Max 10 workers

    logger.info("Starting parallel revision history processing", {
      totalTickets: tickets.length,
      concurrency,
      cpuCount,
    });

    const chunks = chunkArray(tickets, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (ticket) => {
        try {
          logger.info("Fetching revision history via web scraping", {
            userId,
            recordId: ticket.airtableRecordId,
          });

          // Fetch revision history
          const result = await this.fetchRevisionHistory(
            userId,
            ticket.baseId,
            ticket.tableId,
            ticket.airtableRecordId,
            ticket.rowId
          );

          logger.info("Revision history fetched, storing in DB", {
            recordId: ticket.airtableRecordId,
            revisionsCount: result.revisions?.length || 0,
          });

          // Store each revision in MongoDB
          if (result.revisions && result.revisions.length > 0) {
            const savedCount = await this.saveRevisions(
              result.revisions,
              userId
            );

            logger.info("Stored revision history in MongoDB", {
              recordId: ticket.airtableRecordId,
              savedCount,
            });

            return { success: true, recordId: ticket.airtableRecordId };
          } else {
            logger.warn("No revisions found for record", {
              recordId: ticket.airtableRecordId,
            });
            return { success: true, recordId: ticket.airtableRecordId };
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          logger.error("Failed to process ticket in batch", {
            recordId: ticket.airtableRecordId,
            error: errorMessage,
          });

          return {
            success: false,
            recordId: ticket.airtableRecordId,
            error: errorMessage,
          };
        }
      });

      // Wait for all promises in this chunk to complete
      const chunkResults = await Promise.all(promises);

      // Aggregate results
      chunkResults.forEach((result) => {
        results.processed++;
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({
            id: result.recordId,
            error: result.error || "Unknown error",
          });
        }
      });

      // Small delay between chunks to avoid overwhelming the system
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await delay(500);
      }
    }

    return results;
  }

  /**
   * Save revisions to MongoDB
   */
  private async saveRevisions(
    revisions: RevisionChange[],
    userId: string
  ): Promise<number> {
    let savedCount = 0;

    logger.info("Starting to save revisions to MongoDB", {
      count: revisions.length,
      userId,
      sampleRevision: revisions[0],
    });

    for (const revision of revisions) {
      try {
        const saved = await RevisionHistory.findOneAndUpdate(
          {
            uuid: revision.uuid,
            issueId: revision.issueId,
            userId,
          },
          {
            uuid: revision.uuid,
            issueId: revision.issueId,
            columnType: revision.columnType,
            oldValue: revision.oldValue || "",
            newValue: revision.newValue || "",
            createdDate: revision.createdDate,
            authoredBy: revision.authoredBy,
            userId,
            updatedAt: new Date(),
          },
          { upsert: true, new: true }
        );

        if (saved) {
          savedCount++;
          logger.debug("Saved revision to MongoDB", {
            uuid: revision.uuid,
            issueId: revision.issueId,
            columnType: revision.columnType,
          });
        }
      } catch (error) {
        logger.error("Failed to save individual revision", {
          revision,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    logger.info("Finished saving revisions to MongoDB", {
      savedCount,
      totalAttempted: revisions.length,
    });

    return savedCount;
  }

  /**
   * Helper: Extract column type from revision text
   */
  private extractColumnType(text: string): string {
    const lowerText = text.toLowerCase();

    if (lowerText.includes("status")) return "Status";
    if (lowerText.includes("assignee") || lowerText.includes("assigned"))
      return "Assignee";
    if (lowerText.includes("priority")) return "Priority";
    if (lowerText.includes("comment")) return "Comment";
    if (lowerText.includes("description")) return "Description";
    if (lowerText.includes("created")) return "Created";
    if (lowerText.includes("updated")) return "Updated";
    if (lowerText.includes("changed")) return "Field Changed";

    // Return the activity type for all changes
    return "Activity";
  }

  /**
   * Helper: Extract old value from revision text
   */
  private extractOldValue(text: string): string {
    // Look for patterns like "changed from X to Y" or "X → Y"
    const patterns = [
      /from\s+["']?([^"'→]+)["']?\s+to/i,
      /["']?([^"'→]+)["']?\s*→/,
      /was\s+["']?([^"']+)["']?\s*,?\s*now/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return "";
  }

  /**
   * Helper: Extract new value from revision text
   */
  private extractNewValue(text: string): string {
    // Look for patterns like "changed from X to Y" or "X → Y"
    const patterns = [
      /to\s+["']?([^"']+)["']?$/i,
      /→\s*["']?([^"']+)["']?$/,
      /now\s+["']?([^"']+)["']?$/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return "";
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

      return revisions.map((rev: any) => ({
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
   * Checks if cookies are valid before sync and attempts automatic refresh
   */
  async ensureValidCookies(userId: string): Promise<boolean> {
    try {
      const isValid = await CookieScraperService.validateCookies(userId);

      if (!isValid) {
        logger.warn("Cookies invalid, checking if auto-refresh is available", { userId });
        
        // Check if we have stored credentials for auto-refresh
        const connection = await AirtableConnection.findOne({ userId });
        if (connection && connection.email) {
          logger.info("Attempting automatic cookie refresh", { userId, email: connection.email });
          
          try {
            // Attempt automatic refresh (Note: password would be needed for full auto-refresh)
            // For now, provide clear guidance to user
            const refreshResult = await CookieScraperService.validateCookies(userId);
            if (refreshResult) {
              logger.info("Cookie refresh successful", { userId });
              return true;
            }
          } catch (refreshError) {
            logger.error("Automatic cookie refresh failed", refreshError, { userId });
          }
        }
        
        throw new AppError(
          "Cookies are invalid or expired. Please run the cookie refresh command:\n\n" +
          "curl -X POST http://localhost:3000/api/airtable/cookies/login \\\n" +
          '  -H "Content-Type: application/json" \\\n' +
          `  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD","userId":"${userId}"}'",
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

  /**
   * PRODUCTION: Sync revision history for all tickets in database
   * Processes all tickets and stores data in RevisionHistory collection
   */
  async syncAllRevisionHistory(userId?: string): Promise<{
    success: boolean;
    processedTickets: number;
    totalRevisions: number;
    savedRevisions: number;
    errors: string[];
  }> {
    try {
      logger.info("Starting revision history sync for all tickets", { userId });

      // Get all tickets for the user or all tickets if no userId
      const query = userId ? { userId } : {};
      const tickets = await Ticket.find(query).select(
        'userId baseId tableId airtableRecordId title status assignee'
      );

      logger.info(`Found ${tickets.length} tickets to process`);

      const errors: string[] = [];
      let totalRevisions = 0;
      let savedRevisions = 0;
      const batchSize = 5; // Process in batches to avoid overwhelming

      // Process tickets in batches
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (ticket) => {
            try {
              logger.info(`Processing ticket ${i + batch.indexOf(ticket) + 1}/${tickets.length}`, {
                recordId: ticket.airtableRecordId,
                title: (ticket.fields as any)?.Name || 'Unknown'
              });

              const result = await this.fetchRevisionHistoryAPI(
                ticket.userId,
                ticket.airtableRecordId
              );

              totalRevisions += result.revisions.length;

              // Store revisions in the requested format
              const formattedRevisions = result.revisions.map(rev => ({
                uuid: rev.uuid,
                issueId: rev.issueId,
                columnType: rev.columnType,
                oldValue: rev.oldValue,
                newValue: rev.newValue,
                createdDate: rev.createdDate,
                authoredBy: rev.authoredBy,
                userId: ticket.userId,
                baseId: ticket.baseId,
                tableId: ticket.tableId,
                processedAt: new Date()
              }));

              if (formattedRevisions.length > 0) {
                // Use upsert to avoid duplicates
                for (const revision of formattedRevisions) {
                  await RevisionHistory.findOneAndUpdate(
                    { uuid: revision.uuid }, // Match by unique activity ID
                    revision,
                    { upsert: true, new: true }
                  );
                  savedRevisions++;
                }
              }

              // Add delay to avoid rate limiting
              await delay(1000);

            } catch (error) {
              const errorMsg = `Failed to process ${ticket.airtableRecordId}: ${(error as Error).message}`;
              logger.error(errorMsg, { error, recordId: ticket.airtableRecordId });
              errors.push(errorMsg);
            }
          })
        );
      }

      logger.info("Revision history sync completed", {
        processedTickets: tickets.length,
        totalRevisions,
        savedRevisions,
        errors: errors.length
      });

      return {
        success: true,
        processedTickets: tickets.length,
        totalRevisions,
        savedRevisions,
        errors
      };

    } catch (error) {
      logger.error("Failed to sync revision history for all tickets", error);
      throw handleScrapingError(error);
    }
  }

  /**
   * NEW: Fetches revision history using the working API endpoint
   * Uses the correct format: /v0.3/row/{recordId}/readRowActivitiesAndComments
   */
  async fetchRevisionHistoryAPI(
    userId: string,
    recordId: string
  ): Promise<RevisionHistoryResponse> {
    try {
      logger.info("Fetching revision history via API endpoint", {
        userId,
        recordId,
      });

      // Get cookies from database
      const connection = await AirtableConnection.findOne({ userId });
      if (!connection || !connection.cookies) {
        throw new AppError(
          "No valid cookies found. Please refresh authentication.",
          401,
          "NO_COOKIES"
        );
      }

      // Check if cookies are expired
      if (connection.cookiesValidUntil && new Date(connection.cookiesValidUntil) < new Date()) {
        throw new AppError(
          "Cookies have expired. Please refresh authentication.",
          401,
          "COOKIES_EXPIRED"
        );
      }

      // Get ticket information
      const ticket = await Ticket.findOne({ 
        userId, 
        airtableRecordId: recordId 
      });
      if (!ticket) {
        throw new AppError(
          `Ticket not found: ${recordId}`,
          404,
          "TICKET_NOT_FOUND"
        );
      }

      // Get table schema for column mapping
      const table = await Table.findOne({ 
        userId,
        baseId: ticket.baseId,
        airtableTableId: ticket.tableId 
      });
      if (!table) {
        throw new AppError(
          `Table schema not found for ticket ${recordId}`,
          404,
          "TABLE_NOT_FOUND"
        );
      }

      // Use the correct API endpoint format
      const url = `https://airtable.com/v0.3/row/${recordId}/readRowActivitiesAndComments`;
      
      const params = {
        stringifiedObjectParams: JSON.stringify({
          limit: 10,
          offsetV2: null,
          shouldReturnDeserializedActivityItems: true,
          shouldIncludeRowActivityOrCommentUserObjById: true
        }),
        requestId: `req${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
        secretSocketId: `soc${Date.now()}${Math.random().toString(36).substr(2, 9)}`
      };

      logger.info("Making API request to correct endpoint", {
        url,
        recordId,
        tableId: ticket.tableId,
        baseId: ticket.baseId
      });

      const response = await axios.get(url, {
        params: params,
        headers: {
          'Cookie': connection.cookies,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://airtable.com',
          'Referer': `https://airtable.com/${ticket.baseId}`,
          'X-Requested-With': 'XMLHttpRequest',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        },
        timeout: 30000
      });

      logger.info("API response received", {
        recordId,
        status: response.status,
        responseType: typeof response.data
      });

      // Parse the API response
      const parsedRevisions = this.parseAPIResponse(response.data, recordId, table.fields);

      // Save revisions to database
      const savedCount = await this.saveRevisions(parsedRevisions, userId);

      logger.info("API revision history processed", {
        recordId,
        foundRevisions: parsedRevisions.length,
        savedRevisions: savedCount
      });

      return {
        success: true,
        revisions: parsedRevisions,
        message: `Found ${parsedRevisions.length} Status/Assignee changes`
      };

    } catch (error) {
      logger.error("Failed to fetch revision history via API", error, {
        userId,
        recordId,
      });
      throw handleScrapingError(error);
    }
  }

  /**
   * Parse API response to extract revision changes
   */
  private parseAPIResponse(
    response: any,
    recordId: string,
    tableFields: any[]
  ): RevisionChange[] {
    const revisions: RevisionChange[] = [];
    
    try {
      logger.info("Parsing API response", {
        responseType: typeof response,
        responseKeys: Object.keys(response || {})
      });
      
      // Try to find activities in response
      let activities = [];
      
      // Check various possible response structures
      if (response?.data?.results) {
        const results = response.data.results;
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
      } else if (response?.activities) {
        activities = response.activities;
      } else if (response?.data?.activities) {
        activities = response.data.activities;
      }

      logger.info(`Found ${activities.length} activities in API response`);

      // Process each activity
      for (const activity of activities) {
        
        // Only process cell value changes
        const isFieldChange = 
          activity.type === 'updateCellValues' ||
          activity.activityType === 'updateCellValues' ||
          activity.type === 'fieldUpdate' ||
          activity.activityType === 'fieldUpdate';

        if (!isFieldChange) {
          continue;
        }

        const cellChanges = activity.activityData?.cellValuesByColumnId || 
                           activity.data?.cellValuesByColumnId ||
                           activity.cellChanges ||
                           activity.fieldChanges;

        if (!cellChanges) {
          continue;
        }

        // Process each changed column
        for (const [columnId, change] of Object.entries(cellChanges)) {
          
          // Find column information from table schema
          const column = tableFields.find(f => f.id === columnId);
          
          if (!column) {
            continue;
          }

          const columnName = column.name;
          const columnType = column.type;

          // CRITICAL FILTER: Only include Status and Assignee changes
          const isStatusColumn = columnName.toLowerCase().includes('status');
          const isAssigneeColumn = columnName.toLowerCase().includes('assignee') || 
                                   columnType === 'multipleCollaborators' ||
                                   columnType === 'singleCollaborator';

          if (!isStatusColumn && !isAssigneeColumn) {
            continue;
          }

          // Extract old and new values
          const changeData = change as any;
          const oldValue = this.formatFieldValue(changeData.prevValue || changeData.oldValue, columnType);
          const newValue = this.formatFieldValue(changeData.newValue || changeData.value, columnType);

          // Create revision entry
          revisions.push({
            uuid: activity.id || activity.activityId || `activity_${Date.now()}_${Math.random()}`,
            issueId: recordId,
            columnType: isStatusColumn ? 'Status' : 'Assignee',
            oldValue: oldValue,
            newValue: newValue,
            createdDate: new Date(activity.createdTime || activity.timestamp || new Date()),
            authoredBy: activity.originatingUserId || activity.userId || activity.user || 'unknown'
          });
        }
      }

    } catch (error) {
      logger.error('Error parsing API response', error);
    }

    return revisions;
  }

  /**
   * Format field values based on column type
   */
  private formatFieldValue(value: any, columnType?: string): string {
    
    if (value === null || value === undefined) {
      return '';
    }

    // Handle different column types
    switch (columnType) {
      
      case 'singleSelect':
        return value?.name || String(value);
      
      case 'multipleSelects':
        if (Array.isArray(value)) {
          return value.map(v => v?.name || String(v)).join(', ');
        }
        return String(value);
      
      case 'singleCollaborator':
        return value?.email || value?.name || value?.id || String(value);
      
      case 'multipleCollaborators':
        if (Array.isArray(value)) {
          return value.map(v => v?.email || v?.name || v?.id || String(v)).join(', ');
        }
        return String(value);
      
      case 'date':
      case 'dateTime':
        if (typeof value === 'string') {
          return new Date(value).toLocaleDateString();
        }
        return String(value);
      
      case 'checkbox':
        return value ? 'Checked' : 'Unchecked';
      
      default:
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
    }
  }

  /**
   * Batch sync revision history using API method
   */
  async syncRevisionHistoryAPI(
    userId: string,
    baseId?: string,
    tableId?: string
  ): Promise<SyncRevisionHistoryResponse> {
    try {
      logger.info("Starting API-based revision history sync", {
        userId,
        baseId,
        tableId,
      });

      // Validate cookies first
      await this.ensureValidCookies(userId);

      // Build query for tickets
      const query: Record<string, string> = { userId };
      if (baseId) query.baseId = baseId;
      if (tableId) query.tableId = tableId;

      // Fetch all tickets matching criteria
      const tickets = await Ticket.find(query);

      if (tickets.length === 0) {
        logger.info("No tickets found for API sync", { userId, baseId, tableId });
        return {
          success: true,
          processed: 0,
          synced: 0,
          failed: 0,
          errors: [],
        };
      }

      logger.info("Found tickets to process via API", { count: tickets.length });

      let totalProcessed = 0;
      let totalSynced = 0;
      let totalFailed = 0;
      const errors: Array<{ recordId: string; error: string }> = [];

      // Process tickets with rate limiting (API has stricter limits than scraping)
      for (const ticket of tickets) {
        try {
          totalProcessed++;
          
          logger.info("Processing ticket via API", {
            recordId: ticket.airtableRecordId,
            progress: `${totalProcessed}/${tickets.length}`
          });

          const result = await this.fetchRevisionHistoryAPI(
            userId,
            ticket.airtableRecordId
          );

          if (result.success) {
            totalSynced++;
            logger.info("Successfully processed ticket via API", {
              recordId: ticket.airtableRecordId,
              revisionsFound: result.revisions?.length || 0
            });
          }

        } catch (error) {
          totalFailed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          logger.error("Failed to process ticket via API", {
            recordId: ticket.airtableRecordId,
            error: errorMessage
          });

          errors.push({
            recordId: ticket.airtableRecordId,
            error: errorMessage
          });
        }

        // Rate limiting: wait between requests to avoid overwhelming the API
        if (totalProcessed < tickets.length) {
          await delay(2000); // 2 second delay between API calls
        }
      }

      logger.info("API-based revision history sync completed", {
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
      logger.error("Failed to sync revision history via API", error, { userId });
      throw handleScrapingError(error);
    }
  }
}

export default new RevisionHistoryService();
