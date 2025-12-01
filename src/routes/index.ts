import { Router } from "express";
import authRoutes from "./auth";
import bulkRevisionRoutes from "./bulkRevision";
import cookieRoutes from "./cookies";
import dataRoutes from "./data";
import demoRoutes from "./demo";
import oauthRoutes from "./oauth";
import revisionHistoryFetchRoutes from "./revisionHistory";
// import revisionHistoryRoutes from "./revisionHistory";
// import revisionHistoryV2Routes from "./revisionHistoryV2";
import syncRoutes from "./sync";

const router = Router();

// Mount routes
router.use("/auth", authRoutes);
router.use("/oauth", oauthRoutes);
router.use("/sync", syncRoutes);
router.use("/cookies", cookieRoutes);
router.use("/data", dataRoutes); // Real data routes (from database)
router.use("/demo", demoRoutes); // Demo routes for testing data loading
router.use("/revision-history-fetch", revisionHistoryFetchRoutes); // Fetch and store revision histories
// router.use("/revision-history", revisionHistoryRoutes);
// router.use("/revision-history-v2", revisionHistoryV2Routes); // NEW: Internal API implementation
router.use("/revision-history", bulkRevisionRoutes); // BULK AUTOMATION

export default router;
