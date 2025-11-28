import { Router } from "express";
import { validateAuth } from "../controllers/oauthController";

const router = Router();

// POST /api/airtable/auth/validate
router.post("/validate", validateAuth);

export default router;
