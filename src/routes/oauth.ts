import { Router } from "express";
import {
  authorize,
  callback,
  getOAuthTokens,
  refreshToken,
  validate,
} from "../controllers/oauthController";

const router = Router();

router.post("/authorize", authorize);
router.get("/callback", callback);
router.get("/tokens/:userId", getOAuthTokens);
router.post("/refresh", refreshToken);
router.get("/validate", validate);

export default router;
