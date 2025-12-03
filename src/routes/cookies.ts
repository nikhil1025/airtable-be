import { Router } from "express";
import {
  getCookiesForTesting,
  refreshCookies,
  setAccessToken,
  validateCookies,
} from "../controllers/cookieController";

const router = Router();

router.post("/validate", validateCookies);
router.post("/refresh", refreshCookies);
router.post("/set-token", setAccessToken);
router.get("/get/:userId", getCookiesForTesting);

export default router;
