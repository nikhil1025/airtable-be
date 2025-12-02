import { Request, Response } from "express";
import { WorkspaceUser } from "../models";
import AirtableDataService from "../services/AirtableDataService";
import { UsersFetchService } from "../services/UsersFetchService";
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

/**
 * Fetch workspace users for a specific user using cookie-based authentication
 * Similar to revision history fetch pattern
 *
 * GET /api/users/fetch/:userId
 *
 * @param req - Request with userId in params
 * @param res - Response with array of all workspace users
 */
export async function fetchUsersForWorkspace(
  req: Request,
  res: Response
): Promise<void> {
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
    console.log(` FETCHING WORKSPACE USERS FOR USER: ${userId}`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Started at: ${new Date().toISOString()}\n`);

    // Create service instance
    const service = new UsersFetchService(userId);

    // Fetch and store workspace users
    const users = await service.fetchAndStoreWorkspaceUsers();

    console.log(`\n${"=".repeat(70)}`);
    console.log(` FETCH COMPLETED SUCCESSFULLY`);
    console.log(`${"=".repeat(70)}`);
    console.log(` Total Users Fetched: ${users.length}`);
    console.log(` Completed at: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(70)}\n`);

    // Fetch all users for this user from DB
    const allUsers = await WorkspaceUser.find({ userId })
      .sort({ createdTime: -1 })
      .lean();

    console.log(`\n${"=".repeat(70)}`);
    console.log(` DETAILED RESULTS`);
    console.log(`${"=".repeat(70)}\n`);

    // Display results
    allUsers.forEach((user, index) => {
      console.log(
        `${index + 1}. ${user.name} (${user.email}) - ID: ${
          user.airtableUserId
        }`
      );
    });

    console.log(`\n${"=".repeat(70)}\n`);

    res.status(200).json({
      success: true,
      message: `Successfully fetched ${users.length} workspace users`,
      data: {
        totalUsers: allUsers.length,
        users: allUsers.map((user) => ({
          id: user.airtableUserId,
          email: user.email,
          name: user.name,
          state: user.state,
          createdTime: user.createdTime,
          lastActivityTime: user.lastActivityTime,
          invitedBy: user.invitedToAirtableByUserId,
        })),
      },
    });
  } catch (error) {
    console.error(`[UsersController] ✗ Error fetching workspace users:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch workspace users",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default {
  getUsers,
  syncUsers,
  fetchUsersForWorkspace,
};
