import { Router } from "express";
import {
  cancelSession,
  getSessionStatus,
  initiateLogin,
  submitMFA,
} from "../controllers/mfaAuthController";

const router = Router();

router.post("/initiate-login", initiateLogin);
router.post("/submit-mfa", submitMFA);
router.post("/cancel-session", cancelSession);
router.get("/session-status/:sessionId", getSessionStatus);

export default router;
