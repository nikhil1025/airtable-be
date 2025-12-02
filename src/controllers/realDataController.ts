import { Request, Response } from "express";
import AirtableConnection from "../models/AirtableConnection";
import Project from "../models/Project";
import RevisionHistory from "../models/RevisionHistory";
import Table from "../models/Table";
import Ticket from "../models/Ticket";
import { WorkspaceUser } from "../models/WorkspaceUser";
import {
  logger,
  sendErrorResponse,
  sendSuccessResponse,
} from "../utils/errors";

/**
 * GET /api/airtable/data/stats
 * Get real data stats from database (not demo)
 */
export async function getRealStats(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.query;
    const { accessToken, refreshToken } = req.body;

    if (!userId || typeof userId !== "string") {
      return sendErrorResponse(
        res,
        new Error("userId query parameter is required")
      );
    }

    // Store/update OAuth tokens if provided
    if (accessToken && refreshToken) {
      const { encrypt } = require("../utils/encryption");
      const encryptedAccessToken = encrypt(accessToken);
      const encryptedRefreshToken = encrypt(refreshToken);

      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      logger.info("OAuth tokens updated for user", { userId });
    }

    // Use current user's data, fall back to any data if user has none
    let stats = {
      projects: await Project.countDocuments({ userId }),
      tables: await Table.countDocuments({ userId }),
      tickets: await Ticket.countDocuments({ userId }),
      users: await WorkspaceUser.countDocuments({ userId }),
      revisions: await RevisionHistory.countDocuments({ userId }),
    };

    // If current user has no data, fall back to any user's data
    if (stats.projects === 0 && stats.tables === 0 && stats.tickets === 0) {
      logger.info("No data for current user, falling back to any user's data", {
        userId,
      });
      stats = {
        projects: await Project.countDocuments({}),
        tables: await Table.countDocuments({}),
        tickets: await Ticket.countDocuments({}),
        users: await WorkspaceUser.countDocuments({}),
        revisions: await RevisionHistory.countDocuments({}),
      };
    }

    return sendSuccessResponse(res, {
      stats,
      message: "Real stats retrieved successfully",
    });
  } catch (error) {
    logger.error("Failed to get real stats", error);
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/data/projects
 * Get real projects from database with OAuth tokens (not demo)
 */
export async function getRealProjects(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.query;
    const { accessToken, refreshToken } = req.body;

    if (!userId || typeof userId !== "string") {
      return sendErrorResponse(
        res,
        new Error("userId query parameter is required")
      );
    }

    // Store/update OAuth tokens if provided
    if (accessToken && refreshToken) {
      const { encrypt } = require("../utils/encryption");
      const encryptedAccessToken = encrypt(accessToken);
      const encryptedRefreshToken = encrypt(refreshToken);

      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      logger.info("OAuth tokens updated for user", { userId });
    }

    // Use current user's projects, fall back to all projects if user has none
    let projects = await Project.find({ userId }).select(
      "airtableBaseId name permissionLevel description"
    );

    if (projects.length === 0) {
      logger.info(
        "No projects for current user, falling back to any user's projects",
        { userId }
      );
      projects = await Project.find({}).select(
        "airtableBaseId name permissionLevel description"
      );
    }

    const formattedProjects = projects.map((project) => ({
      id: project.airtableBaseId,
      name: project.name,
      permissionLevel: project.permissionLevel || "create",
    }));

    return sendSuccessResponse(res, {
      bases: formattedProjects,
      message: "Real projects retrieved successfully",
    });
  } catch (error) {
    logger.error("Failed to get real projects", error);
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/data/tables/:projectId
 * Get real tables for a project from database with OAuth tokens (not demo)
 */
export async function getRealTables(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { userId } = req.query;
    const { accessToken, refreshToken } = req.body;

    if (!userId || typeof userId !== "string") {
      return sendErrorResponse(
        res,
        new Error("userId query parameter is required")
      );
    }

    if (!projectId) {
      return sendErrorResponse(res, new Error("projectId is required"));
    }

    // Store/update OAuth tokens if provided
    if (accessToken && refreshToken) {
      const { encrypt } = require("../utils/encryption");
      const encryptedAccessToken = encrypt(accessToken);
      const encryptedRefreshToken = encrypt(refreshToken);

      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      logger.info("OAuth tokens updated for user", { userId });
    }

    // Use current user's tables for project, fall back to all tables if user has none
    let tables = await Table.find({ baseId: projectId, userId }).sort({
      name: 1,
    });

    if (tables.length === 0) {
      logger.info(
        "No tables for current user in project, falling back to any user's tables",
        { userId, projectId }
      );
      tables = await Table.find({ baseId: projectId }).sort({ name: 1 });
    }

    const formattedTables = tables.map((table) => ({
      id: table.airtableTableId,
      name: table.name,
      description: table.description || "",
      baseId: table.baseId,
      fields: table.fields || [],
    }));

    return sendSuccessResponse(res, {
      tables: formattedTables,
      message: "Real tables retrieved successfully",
    });
  } catch (error) {
    logger.error("Failed to get real tables", error);
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/data/tickets/:tableId
 * Get real tickets for a table from database with OAuth tokens (not demo)
 */
export async function getRealTickets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { tableId } = req.params;
    const { userId } = req.query;
    const { accessToken, refreshToken } = req.body;

    if (!userId || typeof userId !== "string") {
      return sendErrorResponse(
        res,
        new Error("userId query parameter is required")
      );
    }

    if (!tableId) {
      return sendErrorResponse(res, new Error("tableId is required"));
    }

    // Store/update OAuth tokens if provided
    if (accessToken && refreshToken) {
      const { encrypt } = require("../utils/encryption");
      const encryptedAccessToken = encrypt(accessToken);
      const encryptedRefreshToken = encrypt(refreshToken);

      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      logger.info("OAuth tokens updated for user", { userId });
    }

    // Use current user's tickets for table, fall back to all tickets if user has none
    let tickets = await Ticket.find({ tableId, userId }).sort({
      createdAt: -1,
    });

    if (tickets.length === 0) {
      logger.info(
        "No tickets for current user in table, falling back to any user's tickets",
        { userId, tableId }
      );
      tickets = await Ticket.find({ tableId }).sort({ createdAt: -1 });
    }

    const formattedTickets = tickets.map((ticket) => ({
      id: ticket.airtableRecordId,
      fields: ticket.fields,
      createdTime: ticket.createdAt,
      baseId: ticket.baseId,
      tableId: ticket.tableId,
    }));

    return sendSuccessResponse(res, {
      records: formattedTickets,
      message: "Real tickets retrieved successfully",
    });
  } catch (error) {
    logger.error("Failed to get real tickets", error);
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/data/sync-fresh
 * Refresh data display without fetching from Airtable
 */
export async function syncFresh(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.query;
    const { accessToken, refreshToken } = req.body;

    if (!userId || typeof userId !== "string") {
      return sendErrorResponse(
        res,
        new Error("userId query parameter is required")
      );
    }

    // If tokens are provided, store them and do a real sync from Airtable
    if (accessToken && refreshToken) {
      logger.info("Real sync requested with OAuth tokens in request body", {
        userId,
      });

      // Encrypt tokens before storing
      const { encrypt } = require("../utils/encryption");
      const encryptedAccessToken = encrypt(accessToken);
      const encryptedRefreshToken = encrypt(refreshToken);

      // Store encrypted tokens in database temporarily for sync
      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          updatedAt: new Date(),
        },
        { upsert: true }
      );
    }

    // Check if we have tokens either from request body OR stored in database
    const connection = await AirtableConnection.findOne({ userId });
    if (connection && connection.accessToken && connection.refreshToken) {
      logger.info(
        "Attempting real sync from Airtable using available OAuth tokens",
        {
          userId,
          tokenSource: accessToken ? "request body" : "database",
        }
      );

      try {
        // Now let the sync proceed with OAuth flow
        const AirtableDataService =
          require("../services/AirtableDataService").default;
        const result = await AirtableDataService.syncAll(userId);

        return sendSuccessResponse(res, result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          "Airtable sync failed, falling back to existing database data",
          { userId, error: errorMessage }
        );
        // Continue to fallback below instead of returning error
      }
    } else {
      logger.warn("No OAuth tokens available for real sync", {
        userId,
        hasRequestTokens: !!(accessToken && refreshToken),
        hasStoredTokens: !!(connection && connection.accessToken),
      });
    }

    logger.info("Fresh sync requested - returning existing database data", {
      userId,
    });

    // Just return current database stats without fetching from Airtable
    const projectCount = await Project.countDocuments({});
    const tableCount = await Table.countDocuments({});
    const ticketCount = await Ticket.countDocuments({});

    const result = {
      success: true,
      synced: {
        bases: projectCount,
        tables: tableCount,
        tickets: ticketCount,
        users: 0,
      },
      message: "Existing database data refreshed",
    };

    return sendSuccessResponse(res, result);
  } catch (error) {
    logger.error("Fresh sync failed", error);
    return sendErrorResponse(res, error as Error);
  }
}
