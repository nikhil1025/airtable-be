import { Router } from "express";
import {
  authorize,
  callback,
  refreshToken,
  validate,
} from "../controllers/oauthController";

const router = Router();

// POST /api/airtable/oauth/authorize
router.post("/authorize", authorize);

// GET /api/airtable/oauth/callback
router.get("/callback", callback);

// POST /api/airtable/oauth/refresh
router.post("/refresh", refreshToken);

// GET /api/airtable/oauth/validate
router.get("/validate", validate);

export default router;
