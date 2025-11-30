import axios, { AxiosInstance } from "axios";
import config from "../config";
import { AirtableConnection, Project, Table, Ticket } from "../models";
import {
  AirtableBase,
  AirtablePaginatedResponse,
  AirtableRecord,
  AirtableTable,
  BasesResponse,
  SyncAllResponse,
  TablesResponse,
  TicketsResponse,
} from "../types";
import { decrypt } from "../utils/encryption";
import {
  AuthenticationError,
  handleAirtableError,
  logger,
} from "../utils/errors";
import { RateLimiter, retryWithBackoff } from "../utils/helpers";
import { BatchProcessor } from "../workers/BatchProcessor";
import AirtableAuthService from "./AirtableAuthService";

export class AirtableDataService {
  private rateLimiter: RateLimiter;
  private batchProcessor: BatchProcessor;

  constructor() {
    const cpuCount = require("os").cpus().length;
    const poolSize = Math.max(cpuCount - 1, 4); // Leave 1 CPU for system, min 4

    this.rateLimiter = new RateLimiter(5, 5); // 5 requests per second, max 5 concurrent
    this.batchProcessor = new BatchProcessor(poolSize); // Dynamic pool size based on CPU

    logger.info("AirtableDataService initialized", {
      cpuCount,
      batchProcessorPoolSize: poolSize,
    });
  }

  /**
   * Creates axios instance with authorization header
   * Falls back to cookie-based auth if OAuth fails
   */
  private async getAxiosInstance(userId: string): Promise<AxiosInstance> {
    try {
      // Try OAuth first
      const accessToken = await AirtableAuthService.getValidAccessToken(userId);

      return axios.create({
        baseURL: config.airtable.baseUrl,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
        family: 4, // Force IPv4
      });
    } catch (error: any) {
      // If OAuth fails, check if we have a stored access token from cookie extraction
      logger.warn(
        "OAuth authentication failed, checking for extracted access token",
        {
          userId,
          error: error.message,
        }
      );

      const connection = await AirtableConnection.findOne({ userId });

      if (!connection) {
        throw new AuthenticationError(
          "OAuth authentication failed and no connection found. Please re-authenticate."
        );
      }

      // Try to use scraped access token as fallback (stored separately from OAuth tokens)
      if (connection.scrapedAccessToken) {
        try {
          const extractedToken = decrypt(connection.scrapedAccessToken);
          logger.info("Using scraped access token as fallback", {
            userId,
          });

          return axios.create({
            baseURL: config.airtable.baseUrl,
            headers: {
              Authorization: `Bearer ${extractedToken}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
            family: 4,
          });
        } catch (tokenError: any) {
          logger.warn("Failed to use scraped access token", {
            userId,
            error: tokenError.message,
          });
        }
      }

      // No valid authentication method available
      throw new AuthenticationError(
        "Authentication required. Please complete OAuth authentication first to enable API access."
      );
    }
  }

  /**
   * Fetches ALL bases (projects) from Airtable using pagination
   * Loops through all pages and stores everything in MongoDB
   */
  async fetchAllBases(userId: string): Promise<BasesResponse> {
    try {
      logger.info("Starting fetchAllBases - will fetch all pages", { userId });

      const allBases: AirtableBase[] = [];
      let offset: string | undefined;
      let pageCount = 0;

      // Loop through all pages
      do {
        pageCount++;
        logger.info(`Fetching bases page ${pageCount}`, { userId, offset });

        const axiosInstance = await this.getAxiosInstance(userId);

        const response = await this.rateLimiter.execute(() =>
          retryWithBackoff(async () => {
            const params: Record<string, string> = {};
            if (offset) {
              params.offset = offset;
            }

            const res = await axiosInstance.get<
              AirtablePaginatedResponse<AirtableBase>
            >("/meta/bases", { params });

            return res.data;
          })
        );

        const bases: AirtableBase[] = response.bases || [];
        allBases.push(...bases);

        logger.info(`Fetched bases page ${pageCount}`, {
          userId,
          pageCount: bases.length,
          totalSoFar: allBases.length,
          hasMore: Boolean(response.offset),
        });

        // Store this page in database immediately
        for (const base of bases) {
          await Project.findOneAndUpdate(
            { airtableBaseId: base.id },
            {
              airtableBaseId: base.id,
              name: base.name,
              permissionLevel: base.permissionLevel,
              userId,
              updatedAt: new Date(),
            },
            { upsert: true, new: true }
          );
        }

        offset = response.offset;
      } while (offset);

      logger.info("Successfully fetched ALL bases from Airtable API", {
        userId,
        totalPages: pageCount,
        totalBases: allBases.length,
      });

      return {
        bases: allBases,
        offset: undefined,
        hasMore: false,
      };
    } catch (error) {
      logger.error("Failed to fetch all bases", error, {
        userId,
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
      });
      throw handleAirtableError(error);
    }
  }

  /**
   * DEPRECATED: Use fetchAllBases instead
   * Fetches single page of bases (kept for backward compatibility)
   */
  async fetchBases(userId: string, _offset?: string): Promise<BasesResponse> {
    logger.warn(
      "fetchBases called - this is deprecated, use fetchAllBases instead"
    );
    return this.fetchAllBases(userId);
  }

  /**
   * Fetches ALL tables for a specific base from Airtable using pagination
   * Loops through all pages and stores everything in MongoDB
   */
  async fetchAllTables(
    userId: string,
    baseId: string
  ): Promise<TablesResponse> {
    try {
      logger.info("Starting fetchAllTables - will fetch all pages", {
        userId,
        baseId,
      });

      const allTables: AirtableTable[] = [];
      let offset: string | undefined;
      let pageCount = 0;

      // Loop through all pages
      do {
        pageCount++;
        logger.info(`Fetching tables page ${pageCount}`, {
          userId,
          baseId,
          offset,
        });

        const axiosInstance = await this.getAxiosInstance(userId);

        const response = await this.rateLimiter.execute(() =>
          retryWithBackoff(async () => {
            const params: Record<string, string> = {};
            if (offset) {
              params.offset = offset;
            }

            const res = await axiosInstance.get<
              AirtablePaginatedResponse<AirtableTable>
            >(`/meta/bases/${baseId}/tables`, { params });

            return res.data;
          })
        );

        const tables: AirtableTable[] = response.tables || [];
        allTables.push(...tables);

        logger.info(`Fetched tables page ${pageCount}`, {
          userId,
          baseId,
          pageCount: tables.length,
          totalSoFar: allTables.length,
          hasMore: Boolean(response.offset),
        });

        // Store this page in database immediately
        for (const table of tables) {
          await Table.findOneAndUpdate(
            { airtableTableId: table.id },
            {
              airtableTableId: table.id,
              baseId,
              name: table.name,
              description: table.description || "",
              fields: table.fields || [],
              userId,
              updatedAt: new Date(),
            },
            { upsert: true, new: true }
          );
        }

        offset = response.offset;
      } while (offset);

      logger.info("Successfully fetched ALL tables from Airtable API", {
        userId,
        baseId,
        totalPages: pageCount,
        totalTables: allTables.length,
      });

      return {
        tables: allTables,
        offset: undefined,
        hasMore: false,
      };
    } catch (error) {
      logger.error("Failed to fetch all tables", error, { userId, baseId });
      throw handleAirtableError(error);
    }
  }

  /**
   * DEPRECATED: Use fetchAllTables instead
   * Fetches single page of tables (kept for backward compatibility)
   */
  async fetchTables(
    userId: string,
    baseId: string,
    _offset?: string
  ): Promise<TablesResponse> {
    logger.warn(
      "fetchTables called - this is deprecated, use fetchAllTables instead"
    );
    return this.fetchAllTables(userId, baseId);
  }

  /**
   * Fetches ALL records/tickets from a table from Airtable using pagination
   * Loops through all pages and stores everything in MongoDB
   */
  async fetchAllTickets(
    userId: string,
    baseId: string,
    tableId: string
  ): Promise<TicketsResponse> {
    try {
      logger.info("Starting fetchAllTickets - will fetch all pages", {
        userId,
        baseId,
        tableId,
      });

      const allRecords: AirtableRecord[] = [];
      let offset: string | undefined;
      let pageCount = 0;

      // Loop through all pages
      do {
        pageCount++;
        logger.info(`Fetching tickets page ${pageCount}`, {
          userId,
          baseId,
          tableId,
          offset,
        });

        const axiosInstance = await this.getAxiosInstance(userId);

        const response = await this.rateLimiter.execute(() =>
          retryWithBackoff(async () => {
            const params: Record<string, string> = {};
            if (offset) {
              params.offset = offset;
            }

            const res = await axiosInstance.get<
              AirtablePaginatedResponse<AirtableRecord>
            >(`/${baseId}/${tableId}`, { params });

            return res.data;
          })
        );

        const records: AirtableRecord[] = response.records || [];
        allRecords.push(...records);

        logger.info(`Fetched tickets page ${pageCount}`, {
          userId,
          baseId,
          tableId,
          pageCount: records.length,
          totalSoFar: allRecords.length,
          hasMore: Boolean(response.offset),
        });

        // Store this page in database immediately
        const ticketsWithRowId = records.map((record, index) => ({
          id: record.id,
          fields: record.fields,
          createdTime: record.createdTime,
          rowId:
            (record.fields.rowId as string) ||
            `row_${Date.now()}_${pageCount}_${index}`,
        }));

        for (const ticket of ticketsWithRowId) {
          await Ticket.findOneAndUpdate(
            { airtableRecordId: ticket.id },
            {
              airtableRecordId: ticket.id,
              baseId,
              tableId,
              fields: ticket.fields,
              rowId: ticket.rowId,
              createdTime: new Date(ticket.createdTime),
              userId,
              updatedAt: new Date(),
            },
            { upsert: true, new: true }
          );
        }

        offset = response.offset;
      } while (offset);

      logger.info("Successfully fetched ALL tickets from Airtable API", {
        userId,
        baseId,
        tableId,
        totalPages: pageCount,
        totalTickets: allRecords.length,
      });

      return {
        records: allRecords,
        offset: undefined,
        hasMore: false,
      };
    } catch (error) {
      logger.error("Failed to fetch all tickets", error, {
        userId,
        baseId,
        tableId,
      });
      throw handleAirtableError(error);
    }
  }

  /**
   * DEPRECATED: Use fetchAllTickets instead
   * Fetches single page of tickets (kept for backward compatibility)
   */
  async fetchTickets(
    userId: string,
    baseId: string,
    tableId: string,
    _offset?: string
  ): Promise<TicketsResponse> {
    logger.warn(
      "fetchTickets called - this is deprecated, use fetchAllTickets instead"
    );
    return this.fetchAllTickets(userId, baseId, tableId);
  }

  /**
   * Get bases from MongoDB (cached data)
   */
  async getBasesFromDB(userId: string): Promise<BasesResponse> {
    try {
      logger.info("Fetching bases from MongoDB", { userId });

      const projects = await Project.find({ userId }).sort({ updatedAt: -1 });

      const bases: AirtableBase[] = projects.map((project) => ({
        id: project.airtableBaseId,
        name: project.name,
        permissionLevel: project.permissionLevel,
      }));

      logger.info("Fetched bases from MongoDB", {
        userId,
        count: bases.length,
      });

      return {
        bases,
        offset: undefined,
        hasMore: false,
      };
    } catch (error) {
      logger.error("Failed to fetch bases from MongoDB", error, { userId });
      throw handleAirtableError(error);
    }
  }

  /**
   * Get tables from MongoDB (cached data)
   */
  async getTablesFromDB(
    userId: string,
    baseId: string
  ): Promise<TablesResponse> {
    try {
      logger.info("Fetching tables from MongoDB", { userId, baseId });

      const tables = await Table.find({ userId, baseId }).sort({
        updatedAt: -1,
      });

      const airtableTables: AirtableTable[] = tables.map((table) => ({
        id: table.airtableTableId,
        name: table.name,
        description: table.description,
        fields: table.fields,
      }));

      logger.info("Fetched tables from MongoDB", {
        userId,
        baseId,
        count: airtableTables.length,
      });

      return {
        tables: airtableTables,
        offset: undefined,
        hasMore: false,
      };
    } catch (error) {
      logger.error("Failed to fetch tables from MongoDB", error, {
        userId,
        baseId,
      });
      throw handleAirtableError(error);
    }
  }

  /**
   * Get tickets from MongoDB (cached data)
   */
  async getTicketsFromDB(
    userId: string,
    baseId: string,
    tableId: string
  ): Promise<TicketsResponse> {
    try {
      logger.info("Fetching tickets from MongoDB", {
        userId,
        baseId,
        tableId,
      });

      const tickets = await Ticket.find({ userId, baseId, tableId }).sort({
        updatedAt: -1,
      });

      const records: AirtableRecord[] = tickets.map((ticket) => ({
        id: ticket.airtableRecordId,
        fields: ticket.fields,
        createdTime: ticket.createdTime.toISOString(),
        rowId: ticket.rowId || `row_${ticket.airtableRecordId}`,
      }));

      logger.info("Fetched tickets from MongoDB", {
        userId,
        baseId,
        tableId,
        count: records.length,
      });

      return {
        records,
        offset: undefined,
        hasMore: false,
      };
    } catch (error) {
      logger.error("Failed to fetch tickets from MongoDB", error, {
        userId,
        baseId,
        tableId,
      });
      throw handleAirtableError(error);
    }
  }

  /**
   * Syncs all data: bases, tables, and tickets (with parallel batch processing)
   * Fetches ALL pages from Airtable and stores everything in MongoDB
   */
  async syncAll(userId: string): Promise<SyncAllResponse> {
    try {
      const cpuCount = require("os").cpus().length;
      const maxConcurrency = Math.max(cpuCount - 1, 4); // Leave 1 CPU for system

      logger.info(
        "Starting full sync - will fetch ALL data from Airtable with maximum parallelization",
        {
          userId,
          cpuCount,
          maxConcurrency,
        }
      );

      let totalBases = 0;
      let totalTables = 0;
      let totalTickets = 0;

      // Step 1: Sync ALL bases (fetches all pages internally)
      logger.info("Step 1: Syncing all bases");
      const basesResponse = await this.fetchAllBases(userId);
      totalBases = basesResponse.bases.length;
      logger.info(`Synced ${totalBases} bases`);

      // Step 2: Get all bases from MongoDB for parallel processing
      const bases = await Project.find({ userId });
      logger.info(
        `Processing ${bases.length} bases with ${maxConcurrency} workers`
      );

      // Calculate optimal concurrency levels based on data volume
      const baseConcurrency = Math.min(maxConcurrency, bases.length);
      const tableConcurrency = Math.min(maxConcurrency * 2, 16); // More aggressive for tables

      // Step 3: Process each base in parallel with dynamic concurrency
      const baseResults = await this.batchProcessor.processBatch(
        bases,
        async (base) => {
          let baseTables = 0;
          let baseTickets = 0;

          // Sync ALL tables for this base (fetches all pages internally)
          logger.info(`Syncing all tables for base ${base.airtableBaseId}`);
          const tablesResponse = await this.fetchAllTables(
            userId,
            base.airtableBaseId
          );
          baseTables = tablesResponse.tables.length;
          logger.info(
            `Synced ${baseTables} tables for base ${base.airtableBaseId}`
          );

          // Get all tables for this base from MongoDB
          const tables = await Table.find({
            userId,
            baseId: base.airtableBaseId,
          });

          // Step 4: Process each table in parallel with higher concurrency
          const tableResults = await this.batchProcessor.processBatch(
            tables,
            async (table) => {
              // Sync ALL tickets for this table (fetches all pages internally)
              logger.info(
                `Syncing all tickets for table ${table.airtableTableId} in base ${base.airtableBaseId}`
              );
              const ticketsResponse = await this.fetchAllTickets(
                userId,
                base.airtableBaseId,
                table.airtableTableId
              );
              const tableTickets = ticketsResponse.records.length;
              logger.info(
                `Synced ${tableTickets} tickets for table ${table.airtableTableId}`
              );

              return tableTickets;
            },
            { concurrency: tableConcurrency }
          );

          // Sum up tickets from all tables in this base
          baseTickets = tableResults.reduce((sum, count) => sum + count, 0);

          logger.info("Base sync completed", {
            baseId: base.airtableBaseId,
            baseName: base.name,
            tables: baseTables,
            tickets: baseTickets,
          });

          return { tables: baseTables, tickets: baseTickets };
        },
        {
          concurrency: baseConcurrency,
          onProgress: (completed, total) => {
            const percentage = Math.round((completed / total) * 100);
            logger.info("Sync progress", {
              completed,
              total,
              percentage: `${percentage}%`,
              estimatedRemaining: `${total - completed} bases`,
            });
          },
        }
      );

      // Aggregate results from all bases
      totalTables = baseResults.reduce((sum, r) => sum + r.tables, 0);
      totalTickets = baseResults.reduce((sum, r) => sum + r.tickets, 0);

      logger.info("✅ Full sync completed successfully", {
        userId,
        totalBases,
        totalTables,
        totalTickets,
        concurrencyUsed: {
          bases: baseConcurrency,
          tables: tableConcurrency,
        },
      });

      return {
        success: true,
        synced: {
          bases: totalBases,
          tables: totalTables,
          tickets: totalTickets,
          users: 0,
        },
      };
    } catch (error) {
      logger.error("Full sync failed", error, { userId });
      throw handleAirtableError(error);
    }
  }
}

export default new AirtableDataService();
