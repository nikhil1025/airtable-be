import { Router } from "express";
import cookieRoutes from "./cookies";
import oauthRoutes from "./oauth";
import revisionHistoryRoutes from "./revisionHistory";
import syncRoutes from "./sync";

const router = Router();

// Mount routes
router.use("/oauth", oauthRoutes);
router.use("/sync", syncRoutes);
router.use("/cookies", cookieRoutes);
router.use("/revision-history", revisionHistoryRoutes);

export default router;
