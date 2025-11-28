import { Router } from "express";
import {
  getCookiesForTesting,
  refreshCookies,
  validateCookies,
} from "../controllers/cookieController";

const router = Router();

// POST /api/airtable/cookies/auto-retrieve - DISABLED (using new auth system)
// router.post("/auto-retrieve", autoRetrieveCookies);

// POST /api/airtable/cookies/validate
router.post("/validate", validateCookies);

// POST /api/airtable/cookies/refresh - AUTOMATIC REFRESH
router.post("/refresh", refreshCookies);

// GET /api/airtable/cookies/get/:userId - TEST ONLY: Get raw cookies
router.get("/get/:userId", getCookiesForTesting);

export default router;
