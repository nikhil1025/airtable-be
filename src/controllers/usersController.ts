import { Request, Response } from "express";
import { WorkspaceUser } from "../models";
import AirtableDataService from "../services/AirtableDataService";
import { SyncUsersRequest } from "../types";
import {
    logger,
    sendErrorResponse,
    sendSuccessResponse,
    ValidationError,
} from "../utils/errors";

export async function getUsers(
  req: Request<unknown, unknown, SyncUsersRequest>,
  res: Response
) {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    logger.info("[UsersController] Fetching workspace users from cache", {
      userId,
    });

    const result = await AirtableDataService.getWorkspaceUsersFromDB(userId);

    logger.info("[UsersController] Successfully fetched workspace users", {
      userId,
      count: result.workspaceUsers.length,
    });

    return sendSuccessResponse(res, result);
  } catch (error) {
    logger.error("[UsersController] Failed to fetch workspace users", error, {
      body: req.body,
    });
    return sendErrorResponse(res, error);
  }
}

export async function syncUsers(
  req: Request<unknown, unknown, SyncUsersRequest>,
  res: Response
) {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    logger.info(
      "[UsersController] Starting workspace users sync with cookie-based auth",
      { userId }
    );

    // Clear existing users for this user
    const deleteResult = await WorkspaceUser.deleteMany({ userId });
    logger.info("[UsersController] Cleared existing workspace users", {
      userId,
      deletedCount: deleteResult.deletedCount,
    });

    // Fetch fresh data from Airtable using cookie-based auth
    const result = await AirtableDataService.fetchAllWorkspaceUsers(userId);

    logger.info("[UsersController] Workspace users sync completed", {
      userId,
      totalUsers: result.workspaceUsers.length,
    });

    return sendSuccessResponse(res, {
      success: true,
      synced: result.workspaceUsers.length,
      users: result.workspaceUsers,
    });
  } catch (error) {
    logger.error("[UsersController] Workspace users sync failed", error, {
      userId: req.body.userId,
    });
    return sendErrorResponse(res, error);
  }
}

export default {
  getUsers,
  syncUsers,
};

