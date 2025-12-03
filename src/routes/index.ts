import { Router } from "express";
import authRoutes from "./auth";
import bulkRevisionRoutes from "./bulkRevision";
import cookieRoutes from "./cookies";
import dataRoutes from "./data";
import demoRoutes from "./demo";
import mfaAuthRoutes from "./mfaAuth";
import oauthRoutes from "./oauth";
import revisionHistoryFetchRoutes from "./revisionHistory";
import syncRoutes from "./sync";
import usersRoutes from "./users";

const router = Router();

router.use("/auth", authRoutes);
router.use("/mfa-auth", mfaAuthRoutes); // MFA Authentication
router.use("/oauth", oauthRoutes);
router.use("/sync", syncRoutes);
router.use("/cookies", cookieRoutes);
router.use("/data", dataRoutes);
router.use("/demo", demoRoutes);
router.use("/revision-history", revisionHistoryFetchRoutes);
router.use("/revision-history-bulk", bulkRevisionRoutes);
router.use("/users", usersRoutes);

export default router;
