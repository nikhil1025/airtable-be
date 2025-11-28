import { Router } from "express";
import { RevisionHistoryControllerV2 } from "../controllers/revisionHistoryControllerV2";

const router = Router();

/**
 * Revision History Routes - V2 (Internal API Implementation)
 *
 * These routes use Airtable's internal API endpoint:
 * /v0.3/view/{viewId}/readRowActivitiesAndComments
 */

// POST /api/revision-history-v2/fetch-single
// Fetch revision history for a single ticket
router.post("/fetch-single", RevisionHistoryControllerV2.fetchSingle);

// POST /api/revision-history-v2/fetch-batch
// Fetch revision history for all tickets (batch processing for 200+ records)
router.post("/fetch-batch", RevisionHistoryControllerV2.fetchBatch);

// GET /api/revision-history-v2/statistics/:userId
// Get statistics about stored revision history
router.get("/statistics/:userId", RevisionHistoryControllerV2.getStatistics);

export default router;
