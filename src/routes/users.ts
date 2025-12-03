import { Router } from "express";
import {
  fetchUsersForWorkspace,
  fetchUsersFromAllWorkspaces,
  getUsers,
  getWorkspaces,
  syncUsers,
} from "../controllers/usersController";

const router = Router();

router.get("/workspaces/:userId", getWorkspaces);
router.get("/fetch-all/:userId", fetchUsersFromAllWorkspaces);
router.get("/fetch/:userId/:workspaceId?", fetchUsersForWorkspace);
router.post("/", getUsers);
router.post("/sync", syncUsers);

export default router;
