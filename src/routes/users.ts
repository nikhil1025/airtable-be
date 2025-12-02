import { Router } from "express";
import {
  fetchUsersForWorkspace,
  getUsers,
  syncUsers,
} from "../controllers/usersController";

const router = Router();

/**
 * @route GET /api/users/fetch/:userId
 * @description Fetch workspace users using cookie-based authentication (similar to revision history)
 * @param userId - User ID in params
 * @requires Valid cookies set via /api/airtable/cookies/set-cookies
 */
router.get("/fetch/:userId", fetchUsersForWorkspace);

/**
 * @route POST /api/users
 * @description Get workspace users from MongoDB cache
 * @body { userId: string }
 */
router.post("/", getUsers);

/**
 * @route POST /api/users/sync
 * @description Sync workspace users from Airtable using cookie-based authentication
 * @body { userId: string }
 * @requires Valid access token set via /api/airtable/cookies/set-token
 */
router.post("/sync", syncUsers);

export default router;
