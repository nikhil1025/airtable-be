import { Router } from "express";
import { validateAuth } from "../controllers/oauthController";

const router = Router();

router.post("/validate", validateAuth);

export default router;
