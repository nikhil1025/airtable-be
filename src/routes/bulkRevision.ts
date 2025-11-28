import { Router } from "express";
import { bulkRevisionHistoryAutomation } from "../controllers/bulkRevisionController";

const router = Router();

/**
 * POST /api/airtable/revision-history/bulk-automation
 *
 * Automated bulk revision history processing:
 * 1. Gets all tickets from MongoDB (airtableRecordId field)
 * 2. Validates cookies properly with all auth/localStorage data
 * 3. Creates URL list with exact format specified
 * 4. Iterates through each record hitting the endpoint
 * 5. Extracts revision history in specified JSON format
 * 6. Stores in revision history collection
 * 7. Prints everything to terminal with detailed logging
 *
 * Body: { userId: string }
 */
router.post("/bulk-automation", bulkRevisionHistoryAutomation);

export default router;
