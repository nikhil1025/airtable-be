import { Router } from "express";
import { bulkRevisionHistoryAutomation } from "../controllers/bulkRevisionController";

const router = Router();

router.post("/bulk-automation", bulkRevisionHistoryAutomation);

export default router;
