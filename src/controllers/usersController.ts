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
 * GET /api/users/fetch/:userId/:workspaceId
 *
 * @param req - Request with userId and optional workspaceId in params
 * @param res - Response with array of all workspace users
 */
export async function fetchUsersForWorkspace(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { userId, workspaceId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(` FETCHING WORKSPACE USERS FOR USER: ${userId}`);
    if (workspaceId) {
      console.log(` WORKSPACE: ${workspaceId}`);
    }
    console.log(`${"=".repeat(70)}`);
    console.log(` Started at: ${new Date().toISOString()}\n`);

    // Create service instance
    const service = new UsersFetchService(userId);

    if (workspaceId) {
      // Fetch users for specific workspace
      const result = await service.fetchUsersForWorkspace(workspaceId);

      console.log(`\n${"=".repeat(70)}`);
      console.log(` FETCH COMPLETED SUCCESSFULLY`);
      console.log(`${"=".repeat(70)}`);
      console.log(` Workspace: ${result.workspaceName}`);
      console.log(` Total Users: ${result.users.length}`);
      console.log(` Completed at: ${new Date().toISOString()}`);
      console.log(`${"=".repeat(70)}\n`);

      res.status(200).json({
        success: true,
        data: {
          workspaceId: result.workspaceId,
          workspaceName: result.workspaceName,
          users: result.users,
          totalUsers: result.users.length,
        },
      });
    } else {
      // Fetch and store workspace users from all workspaces
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
    }
  } catch (error) {
    console.error(`[UsersController] ✗ Error fetching workspace users:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch workspace users",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get all workspaces for a user
 *
 * GET /api/users/workspaces/:userId
 */
export async function getWorkspaces(
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

    const service = new UsersFetchService(userId);
    const workspaces = await service.getWorkspaces();

    res.status(200).json({
      success: true,
      data: {
        workspaces,
        totalWorkspaces: workspaces.length,
      },
    });
  } catch (error: any) {
    console.error("Error getting workspaces:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get workspaces",
    });
  }
}

/**
 * Fetch users from all workspaces with detailed results
 *
 * GET /api/users/fetch-all/:userId
 */
export async function fetchUsersFromAllWorkspaces(
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

    const service = new UsersFetchService(userId);
    const results = await service.fetchUsersFromAllWorkspaces();

    // Calculate totals
    const totalUsers = results.reduce((sum, r) => sum + r.users.length, 0);
    const successfulWorkspaces = results.filter((r) => !r.error).length;

    res.status(200).json({
      success: true,
      data: {
        workspaces: results,
        totalWorkspaces: results.length,
        successfulWorkspaces,
        totalUsers,
      },
    });
  } catch (error: any) {
    console.error("Error fetching users from all workspaces:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch users from all workspaces",
    });
  }
}

export default {
  getUsers,
  syncUsers,
  fetchUsersForWorkspace,
  getWorkspaces,
  fetchUsersFromAllWorkspaces,
};
