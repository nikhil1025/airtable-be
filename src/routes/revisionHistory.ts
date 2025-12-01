import { Router } from "express";
import {
  fetchRevisionHistoriesForUser,
  getAllRevisionsFlat,
  getRecordRevisions,
  getRevisionHistoriesForUser,
  getRevisionsByFilter,
  scrapeSingleRecord,
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

/**
 * @route   GET /api/revision-history/all/:userId
 * @desc    Get all revision histories as flat array (no grouping)
 * @access  Public (should be protected in production)
 * @query   limit, skip, sortBy, sortOrder
 */
router.get("/all/:userId", getAllRevisionsFlat);

/**
 * @route   GET /api/revision-history/record/:recordId
 * @desc    Get revision history for a specific record
 * @access  Public (should be protected in production)
 * @query   userId, limit, sortBy, sortOrder
 */
router.get("/record/:recordId", getRecordRevisions);

/**
 * @route   GET /api/revision-history/filter
 * @desc    Get revision histories filtered by baseId and/or tableId
 * @access  Public (should be protected in production)
 * @query   baseId, tableId, userId, limit, skip, sortBy, sortOrder
 */
router.get("/filter", getRevisionsByFilter);

/**
 * @route   POST /api/revision-history/scrape/record
 * @desc    Scrape revision history for a single record
 * @access  Public (should be protected in production)
 * @body    userId, recordId, baseId, tableId
 */
router.post("/scrape/record", scrapeSingleRecord);

export default router;
