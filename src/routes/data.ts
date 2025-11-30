import express from "express";
import {
  getRealProjects,
  getRealStats,
  getRealTables,
  getRealTickets,
  syncFresh,
} from "../controllers/realDataController";

const router = express.Router();

// Real data endpoints (from database, not demo) - POST to send OAuth tokens
router.post("/stats", getRealStats);
router.post("/projects", getRealProjects);
router.post("/tables/:projectId", getRealTables);
router.post("/tickets/:tableId", getRealTickets);

// Fresh sync endpoint (bypasses cookie issues)
router.post("/sync-fresh", syncFresh);

export default router;
