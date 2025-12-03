import { Router } from "express";
import {
  syncAll,
  syncBases,
  syncTables,
  syncTickets,
  // syncUsers,
} from "../controllers/syncController";

const router = Router();

router.post("/bases", syncBases);
router.post("/tables", syncTables);
router.post("/tickets", syncTickets);
router.post("/all", syncAll);

export default router;
