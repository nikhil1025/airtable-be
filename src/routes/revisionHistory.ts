import { Router } from "express";
import {
  fetchRevisionHistory,
  fetchRevisionHistoryAPI,
  getRevisionHistory,
  syncRevisionHistory,
  syncRevisionHistoryAPI,
} from "../controllers/revisionHistoryController";

const router = Router();

// POST /api/airtable/revision-history/fetch
router.post("/fetch", fetchRevisionHistory);

// POST /api/airtable/revision-history/sync
router.post("/sync", syncRevisionHistory);

// GET /api/airtable/revision-history/:ticketId
router.get("/:ticketId", getRevisionHistory);

// POST /api/airtable/revision-history/fetch-api (NEW API METHOD)
router.post("/fetch-api", fetchRevisionHistoryAPI);

// POST /api/airtable/revision-history/sync-api (NEW API METHOD)
router.post("/sync-api", syncRevisionHistoryAPI);

export default router;
