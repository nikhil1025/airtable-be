import { Request, Response } from "express";
import AirtableDataService from "../services/AirtableDataService";
import {
  SyncAllRequest,
  SyncBasesRequest,
  SyncTablesRequest,
  SyncTicketsRequest,
} from "../types";
import {
  logger,
  sendErrorResponse,
  sendSuccessResponse,
  ValidationError,
} from "../utils/errors";

export async function syncBases(
  req: Request<unknown, unknown, SyncBasesRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, forceSync } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    let result;

    if (forceSync) {
      logger.info("Syncing ALL bases from Airtable API (force sync)", {
        userId,
      });
      result = await AirtableDataService.fetchAllBases(userId);
    } else {
      logger.info("Fetching bases from MongoDB (cache mode)", { userId });
      result = await AirtableDataService.getBasesFromDB(userId);
    }

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export async function syncTables(
  req: Request<unknown, unknown, SyncTablesRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, baseId, forceSync } = req.body;

    if (!userId || !baseId) {
      throw new ValidationError("userId and baseId are required");
    }

    let result;

    if (forceSync) {
      logger.info("Syncing ALL tables from Airtable API (force sync)", {
        userId,
        baseId,
      });
      result = await AirtableDataService.fetchAllTables(userId, baseId);
    } else {
      logger.info("Fetching tables from MongoDB (cache mode)", {
        userId,
        baseId,
      });
      result = await AirtableDataService.getTablesFromDB(userId, baseId);
    }

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export async function syncTickets(
  req: Request<unknown, unknown, SyncTicketsRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, baseId, tableId, forceSync } = req.body;

    if (!userId || !baseId || !tableId) {
      throw new ValidationError("userId, baseId, and tableId are required");
    }

    let result;

    if (forceSync) {
      logger.info("Syncing ALL tickets from Airtable API (force sync)", {
        userId,
        baseId,
        tableId,
      });
      result = await AirtableDataService.fetchAllTickets(
        userId,
        baseId,
        tableId
      );
    } else {
      logger.info("Fetching tickets from MongoDB (cache mode)", {
        userId,
        baseId,
        tableId,
      });
      result = await AirtableDataService.getTicketsFromDB(
        userId,
        baseId,
        tableId
      );
    }

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export async function syncAll(
  req: Request<unknown, unknown, SyncAllRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.body;

    logger.info("[SyncController] Received syncAll request", {
      userId,
      body: req.body,
      url: req.url,
      method: req.method,
    });

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    logger.info(" [SyncController] Starting full data sync", { userId });
    const result = await AirtableDataService.syncAll(userId);

    logger.info(" [SyncController] Full sync completed successfully", {
      userId,
      result,
    });

    return sendSuccessResponse(res, result);
  } catch (error) {
    logger.error(" [SyncController] Full sync failed", error, {
      userId: req.body.userId,
    });
    return sendErrorResponse(res, error);
  }
}

export default {
  syncBases,
  syncTables,
  syncTickets,
  // syncUsers,
  syncAll,
};
