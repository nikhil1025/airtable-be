import { Request, Response } from "express";
import { Project } from "../models";
import { authSessionManager } from "../services/AuthSessionManager";
import { mfaAuthService } from "../services/MFAAuthService";
import { logger } from "../utils/errors";

/**
 * MFA AUTHENTICATION CONTROLLER
 *
 * Handles MFA authentication endpoints for headless Puppeteer login
 */

/**
 * POST /api/airtable/auth/initiate-login
 * Step 1: Start login with email and password
 */
export const initiateLogin = async (req: Request, res: Response) => {
  try {
    const { email, password, userId } = req.body;

    // Validation
    if (!email || !password || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: email, password, userId",
      });
    }

    // Fetch all projects for the user
    const projects = await Project.find({ userId });
    if (!projects || projects.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No projects found for this user. Please connect to Airtable first.",
      });
    }

    logger.info("Initiate login request", {
      email,
      userId,
      totalProjects: projects.length,
    });

    // Try logging in with each project's baseId until one succeeds
    let lastError = null;
    for (const project of projects) {
      const baseId = project.airtableBaseId;

      logger.info(`Attempting login with baseId: ${baseId}`);

      try {
        const result = await mfaAuthService.initiateLogin(
          email,
          password,
          baseId,
          userId
        );

        if (result.success) {
          logger.info(`Login successful with baseId: ${baseId}`);
          return res.status(200).json(result);
        }

        lastError = result.error || result.message;
      } catch (error: any) {
        logger.warn(`Login failed with baseId ${baseId}`, {
          error: error.message,
        });
        lastError = error.message;
        // Continue to next project
      }
    }

    // If we get here, all projects failed
    return res.status(400).json({
      success: false,
      message: `Failed to login with all ${projects.length} projects`,
      error: lastError,
    });
  } catch (error: any) {
    logger.error("Error in initiateLogin controller", { error });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * POST /api/airtable/auth/submit-mfa
 * Step 2: Submit MFA code
 */
export const submitMFA = async (req: Request, res: Response) => {
  try {
    const { sessionId, mfaCode } = req.body;

    // Validation
    if (!sessionId || !mfaCode) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: sessionId, mfaCode",
      });
    }

    logger.info("Submit MFA request", { sessionId });

    // Submit MFA code
    const result = await mfaAuthService.submitMFA(sessionId, mfaCode);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error("Error in submitMFA controller", { error });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * POST /api/airtable/auth/cancel-session
 * Cancel an active authentication session
 */
export const cancelSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    // Validation
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: sessionId",
      });
    }

    logger.info("Cancel session request", { sessionId });

    // Cancel session
    await mfaAuthService.cancelSession(sessionId);

    return res.status(200).json({
      success: true,
      message: "Session cancelled successfully",
    });
  } catch (error: any) {
    logger.error("Error in cancelSession controller", { error });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * GET /api/airtable/auth/session-status/:sessionId
 * Check if a session is still active
 */
export const getSessionStatus = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Missing sessionId parameter",
      });
    }

    const session = authSessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        active: false,
        message: "Session not found or expired",
      });
    }

    return res.status(200).json({
      success: true,
      active: true,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });
  } catch (error: any) {
    logger.error("Error in getSessionStatus controller", { error });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
