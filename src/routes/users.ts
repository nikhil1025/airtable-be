import { Router } from "express";
import {
  fetchUsersForWorkspace,
  fetchUsersFromAllWorkspaces,
  getUsers,
  getWorkspaces,
  syncUsers,
} from "../controllers/usersController";

const router = Router();

// Get all workspaces for a user
router.get("/workspaces/:userId", getWorkspaces);

// Fetch users from all workspaces with detailed results
router.get("/fetch-all/:userId", fetchUsersFromAllWorkspaces);

// Fetch users for a specific workspace or all workspaces
router.get("/fetch/:userId/:workspaceId?", fetchUsersForWorkspace);

// Get users from cache
router.post("/", getUsers);

// Sync users (refresh from Airtable)
router.post("/sync", syncUsers);

export default router;
