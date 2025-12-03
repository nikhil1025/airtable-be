import express from "express";
import {
  getRealProjects,
  getRealStats,
  getRealTables,
  getRealTickets,
  syncFresh,
} from "../controllers/realDataController";

const router = express.Router();

router.post("/stats", getRealStats);
router.post("/projects", getRealProjects);
router.post("/tables/:projectId", getRealTables);
router.post("/tickets/:tableId", getRealTickets);
router.post("/sync-fresh", syncFresh);

export default router;
