import { Router } from "express";
import {
  syncAll,
  syncBases,
  syncTables,
  syncTickets,
  syncUsers,
} from "../controllers/syncController";

const router = Router();

// POST /api/airtable/sync/bases
router.post("/bases", syncBases);

// POST /api/airtable/sync/tables
router.post("/tables", syncTables);

// POST /api/airtable/sync/tickets
router.post("/tickets", syncTickets);

// POST /api/airtable/sync/users
router.post("/users", syncUsers);

// POST /api/airtable/sync/all
router.post("/all", syncAll);

export default router;
