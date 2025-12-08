import { Router } from "express";
import {
  getPaginatedBases,
  getPaginatedRecords,
  getPaginatedTables,
} from "../controllers/airtablePaginationController";

const router = Router();

router.post("/bases", getPaginatedBases);
router.post("/tables", getPaginatedTables);
router.post("/records", getPaginatedRecords);

export default router;
