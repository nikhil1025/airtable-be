import { Router } from "express";
import {
  cancelSession,
  getSessionStatus,
  initiateLogin,
  submitMFA,
} from "../controllers/mfaAuthController";

const router = Router();

/**
 * MFA AUTHENTICATION ROUTES
 *
 * Endpoints for headless MFA authentication flow
 */

// POST /api/airtable/auth/initiate-login - Step 1: Start login
router.post("/initiate-login", initiateLogin);

// POST /api/airtable/auth/submit-mfa - Step 2: Submit MFA code
router.post("/submit-mfa", submitMFA);

// POST /api/airtable/auth/cancel-session - Cancel active session
router.post("/cancel-session", cancelSession);

// GET /api/airtable/auth/session-status/:sessionId - Check session status
router.get("/session-status/:sessionId", getSessionStatus);

export default router;
