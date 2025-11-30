import { Request, Response } from "express";
import AirtableConnection from "../models/AirtableConnection";
import AirtableAuthService from "../services/AirtableAuthService";
import {
  AuthorizeRequest,
  AuthorizeResponse,
  OAuthCallbackQuery,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from "../types";
import { decrypt } from "../utils/encryption";
import {
  sendErrorResponse,
  sendSuccessResponse,
  ValidationError,
} from "../utils/errors";

/**
 * POST /api/airtable/oauth/authorize
 * Initiates OAuth flow
 */
export async function authorize(
  req: Request<unknown, unknown, AuthorizeRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    const authUrl = await AirtableAuthService.initiateOAuth(userId);

    const response: AuthorizeResponse = { authUrl };

    return sendSuccessResponse(res, response);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * GET /api/airtable/oauth/callback
 * Handles OAuth callback and redirects to frontend
 */
export async function callback(
  req: Request<unknown, unknown, unknown, OAuthCallbackQuery>,
  res: Response
): Promise<void> {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth error from Airtable
    if (error) {
      const errorMsg = error_description || error;
      return res.redirect(
        `http://localhost:4200/oauth/callback?error=${encodeURIComponent(
          errorMsg
        )}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        `http://localhost:4200/oauth/callback?error=${encodeURIComponent(
          "Missing code or state parameter"
        )}`
      );
    }

    // Handle the OAuth callback
    await AirtableAuthService.handleCallback(code as string, state as string);

    // Redirect to frontend success page
    res.redirect(
      `http://localhost:4200/oauth/callback?success=true&state=${state}`
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Authentication failed";
    res.redirect(
      `http://localhost:4200/oauth/callback?error=${encodeURIComponent(
        errorMsg
      )}`
    );
  }
}

/**
 * POST /api/airtable/oauth/refresh
 * Refreshes access token
 */
export async function refreshToken(
  req: Request<unknown, unknown, RefreshTokenRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    const accessToken = await AirtableAuthService.refreshAccessToken(userId);

    const response: RefreshTokenResponse = {
      success: true,
      accessToken,
    };

    return sendSuccessResponse(res, response);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * GET /api/airtable/oauth/tokens/:userId
 * Get OAuth tokens for frontend localStorage storage
 */
export async function getOAuthTokens(
  req: Request<{ userId: string }>,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    const connection = await AirtableConnection.findOne({ userId });

    if (!connection || !connection.accessToken || !connection.refreshToken) {
      throw new ValidationError("No OAuth tokens found for user");
    }

    // Decrypt tokens for frontend
    const accessToken = decrypt(connection.accessToken);
    const refreshToken = decrypt(connection.refreshToken);

    return sendSuccessResponse(res, {
      accessToken,
      refreshToken,
      userId,
    });
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export default {
  authorize,
  callback,
  refreshToken,
  getOAuthTokens,
  validate,
};

/**
 * GET /api/airtable/oauth/validate
 * Validates if user has valid authentication
 */
export async function validate(req: Request, res: Response): Promise<Response> {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== "string") {
      throw new ValidationError("userId is required");
    }

    const hasConnection = await AirtableAuthService.hasValidConnection(userId);

    return sendSuccessResponse(res, {
      isAuthenticated: hasConnection,
      userId,
    });
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/auth/validate
 * Simple manual authentication validation
 */
export async function validateAuth(
  req: Request<unknown, unknown, { email: string; password: string }>,
  res: Response
): Promise<Response> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError("Email and password are required");
    }

    // Perform actual login with Puppeteer to extract cookies
    console.log(`[AUTH_VALIDATION] Starting login process for email: ${email}`);

    const loginResult = await AirtableAuthService.performLoginAndExtractCookies(
      email,
      password
    );

    if (!loginResult.success) {
      throw new Error(loginResult.error || "Login failed");
    }

    console.log(
      `[AUTH_VALIDATION] Login successful, extracted ${
        loginResult.cookies?.length || 0
      } cookies`
    );

    return sendSuccessResponse(res, {
      message: "Authentication successful! Cookies extracted and stored.",
      userId: loginResult.userId,
      cookiesCount: loginResult.cookies?.length || 0,
    });
  } catch (error: any) {
    console.error("[AUTH_VALIDATION] Error:", error);
    return sendErrorResponse(res, error);
  }
}
