import { Router } from "express";
import {
  fetchRevisionHistoriesForUser,
  getRevisionHistoriesForUser,
} from "../controllers/revisionHistoryFetchController";

const router = Router();

/**
 * @route   GET /api/revision-history/fetch/:userId
 * @desc    Fetch revision histories from Airtable and store in MongoDB
 * @access  Public (should be protected in production)
 */
router.get("/fetch/:userId", fetchRevisionHistoriesForUser);

/**
 * @route   GET /api/revision-history/user/:userId
 * @desc    Get all revision histories for a user from database
 * @access  Public (should be protected in production)
 */
router.get("/user/:userId", getRevisionHistoriesForUser);

export default router;
