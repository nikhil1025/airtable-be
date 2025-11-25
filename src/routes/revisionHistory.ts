import { Router } from "express";
import {
  fetchRevisionHistory,
  getRevisionHistory,
  syncRevisionHistory,
} from "../controllers/revisionHistoryController";

const router = Router();

// POST /api/airtable/revision-history/fetch
router.post("/fetch", fetchRevisionHistory);

// POST /api/airtable/revision-history/sync
router.post("/sync", syncRevisionHistory);

// GET /api/airtable/revision-history/:ticketId
router.get("/:ticketId", getRevisionHistory);

export default router;
