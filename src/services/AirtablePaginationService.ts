import axios, { AxiosInstance } from "axios";
import config from "../config";
import { AirtableConnection } from "../models";
import {
  AirtableBase,
  AirtablePaginatedResponse,
  AirtableRecord,
  AirtableTable,
  BasesResponse,
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
import AirtableAuthService from "./AirtableAuthService";

export class AirtablePaginationService {
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter(5, 5);
    logger.info("AirtablePaginationService initialized");
  }

  private async getAxiosInstance(userId: string): Promise<AxiosInstance> {
    try {
      const accessToken = await AirtableAuthService.getValidAccessToken(userId);

      return axios.create({
        baseURL: config.airtable.baseUrl,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
        family: 4,
      });
    } catch (error: any) {
      logger.warn("OAuth failed, checking for extracted access token", {
        userId,
        error: error.message,
      });

      const connection = await AirtableConnection.findOne({ userId });

      if (!connection) {
        throw new AuthenticationError(
          "OAuth failed and no connection found. Please re-authenticate."
        );
      }

      if (connection.scrapedAccessToken) {
        try {
          const extractedToken = decrypt(connection.scrapedAccessToken);
          logger.info("Using scraped access token", { userId });

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

      throw new AuthenticationError(
        "Authentication required. Please complete OAuth first."
      );
    }
  }

  async fetchPaginatedBases(
    userId: string,
    offset?: string,
    pageSize: number = 100
  ): Promise<BasesResponse> {
    try {
      logger.info("Fetching paginated bases from Airtable", {
        userId,
        offset,
        pageSize,
      });

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

      logger.info("Fetched paginated bases", {
        userId,
        count: bases.length,
        hasMore: Boolean(response.offset),
      });

      return {
        bases,
        offset: response.offset,
        hasMore: Boolean(response.offset),
      };
    } catch (error) {
      logger.error("Failed to fetch paginated bases", error, { userId });
      throw handleAirtableError(error);
    }
  }

  async fetchPaginatedTables(
    userId: string,
    baseId: string,
    offset?: string,
    pageSize: number = 100
  ): Promise<TablesResponse> {
    try {
      logger.info("Fetching paginated tables from Airtable", {
        userId,
        baseId,
        offset,
        pageSize,
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

      logger.info("Fetched paginated tables", {
        userId,
        baseId,
        count: tables.length,
        hasMore: Boolean(response.offset),
      });

      return {
        tables,
        offset: response.offset,
        hasMore: Boolean(response.offset),
      };
    } catch (error) {
      logger.error("Failed to fetch paginated tables", error, {
        userId,
        baseId,
      });
      throw handleAirtableError(error);
    }
  }

  async fetchPaginatedRecords(
    userId: string,
    baseId: string,
    tableId: string,
    offset?: string,
    pageSize: number = 100
  ): Promise<TicketsResponse> {
    try {
      logger.info("Fetching paginated records from Airtable", {
        userId,
        baseId,
        tableId,
        offset,
        pageSize,
      });

      const axiosInstance = await this.getAxiosInstance(userId);

      const response = await this.rateLimiter.execute(() =>
        retryWithBackoff(async () => {
          const params: Record<string, any> = {
            pageSize: Math.min(pageSize, 100),
          };
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

      logger.info("Fetched paginated records", {
        userId,
        baseId,
        tableId,
        count: records.length,
        hasMore: Boolean(response.offset),
      });

      return {
        records,
        offset: response.offset,
        hasMore: Boolean(response.offset),
      };
    } catch (error) {
      logger.error("Failed to fetch paginated records", error, {
        userId,
        baseId,
        tableId,
      });
      throw handleAirtableError(error);
    }
  }
}

export default new AirtablePaginationService();
