import axios from "axios";
import crypto from "crypto";
import config from "../config";
import AirtableConnection from "../models/AirtableConnection";
import { OAuthRefreshResponse, OAuthTokenResponse } from "../types";
import { decrypt, encrypt } from "../utils/encryption";
import { AirtableError, AuthenticationError, logger } from "../utils/errors";
import { WorkerPool } from "../workers/WorkerPool";

// Store PKCE code verifiers temporarily (in production, use Redis or database)
const pkceStore = new Map<string, string>();

export class AirtableAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly authorizationUrl =
    "https://airtable.com/oauth2/v1/authorize";
  private readonly tokenUrl = "https://airtable.com/oauth2/v1/token";

  constructor() {
    this.clientId = config.airtable.clientId;
    this.clientSecret = config.airtable.clientSecret;
    this.redirectUri = config.airtable.redirectUri;

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Airtable OAuth credentials are not configured");
    }
  }

  /**
   * Generates PKCE code verifier and challenge
   */
  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    // Generate random code verifier (43-128 characters)
    const codeVerifier = crypto.randomBytes(32).toString("base64url");

    // Create code challenge using SHA256
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    return { codeVerifier, codeChallenge };
  }

  /**
   * Initiates OAuth flow and returns authorization URL
   */
  async initiateOAuth(userId: string): Promise<string> {
    try {
      const state = crypto.randomBytes(32).toString("hex");
      const scope = "data.records:read data.records:write schema.bases:read";

      // Generate PKCE values
      const { codeVerifier, codeChallenge } = this.generatePKCE();

      // Store code verifier for later use in token exchange
      const stateKey = `${userId}:${state}`;
      pkceStore.set(stateKey, codeVerifier);

      // Clean up old entries after 10 minutes
      setTimeout(() => pkceStore.delete(stateKey), 10 * 60 * 1000);

      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        response_type: "code",
        state: stateKey,
        scope,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      const authUrl = `${this.authorizationUrl}?${params.toString()}`;

      logger.info("OAuth flow initiated with PKCE", { userId });

      return authUrl;
    } catch (error) {
      logger.error("Failed to initiate OAuth", error, { userId });
      throw new AuthenticationError("Failed to initiate OAuth flow");
    }
  }

  /**
   * Handles OAuth callback and exchanges code for tokens
   */
  async handleCallback(code: string, state: string): Promise<void> {
    try {
      // Extract userId from state
      const [userId] = state.split(":");

      if (!userId) {
        throw new AuthenticationError("Invalid state parameter");
      }

      // Retrieve code verifier
      const codeVerifier = pkceStore.get(state);

      if (!codeVerifier) {
        throw new AuthenticationError(
          "PKCE code verifier not found or expired"
        );
      }

      // Exchange authorization code for tokens
      const tokenData = await this.exchangeCodeForTokens(code, codeVerifier);

      // Clean up code verifier
      pkceStore.delete(state);

      // Encrypt and store tokens
      await this.storeTokens(
        userId,
        tokenData.access_token,
        tokenData.refresh_token
      );

      logger.info("OAuth callback handled successfully", { userId });
    } catch (error) {
      logger.error("OAuth callback failed", error);
      throw error;
    }
  }

  /**
   * Exchanges authorization code for access and refresh tokens
   */
  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<OAuthTokenResponse> {
    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        code_verifier: codeVerifier,
      });

      logger.info("Exchanging code for tokens", {
        tokenUrl: this.tokenUrl,
        clientId: this.clientId,
        hasCodeVerifier: !!codeVerifier,
        redirectUri: this.redirectUri,
      });

      const response = await axios.post<OAuthTokenResponse>(
        this.tokenUrl,
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${this.clientId}:${this.clientSecret}`
            ).toString("base64")}`,
          },
        }
      );

      logger.info("Successfully exchanged code for tokens");

      return response.data;
    } catch (error: any) {
      logger.error("Failed to exchange code for tokens", {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers,
      });
      throw new AuthenticationError(
        `Failed to exchange authorization code: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Refreshes access token using refresh token
   */
  async refreshAccessToken(userId: string): Promise<string> {
    try {
      const connection = await AirtableConnection.findOne({ userId });

      if (!connection) {
        throw new AuthenticationError("No Airtable connection found for user");
      }

      // Decrypt refresh token
      const refreshToken = decrypt(connection.refreshToken);

      // Request new access token
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });

      const response = await axios.post<OAuthRefreshResponse>(
        this.tokenUrl,
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${this.clientId}:${this.clientSecret}`
            ).toString("base64")}`,
          },
        }
      );

      // Encrypt and update access token
      const encryptedAccessToken = encrypt(response.data.access_token);
      connection.accessToken = encryptedAccessToken;
      connection.updatedAt = new Date();
      await connection.save();

      logger.info("Access token refreshed", { userId });

      return response.data.access_token;
    } catch (error: any) {
      // Log detailed error information
      if (error.response) {
        logger.error("OAuth refresh failed - server response", {
          userId,
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          tokenUrl: this.tokenUrl,
        });

        // If refresh token is invalid/expired, clear the connection
        if (error.response.status === 400) {
          logger.warn(
            "Refresh token expired or invalid - clearing connection",
            { userId }
          );
          await AirtableConnection.findOneAndDelete({ userId });
          throw new AuthenticationError(
            "Refresh token expired. Please re-authenticate via OAuth."
          );
        }
      } else {
        logger.error("Failed to refresh access token", error, { userId });
      }

      throw new AuthenticationError("Failed to refresh access token");
    }
  }

  /**
   * Gets a valid access token (refreshes if needed)
   */
  async getValidAccessToken(userId: string): Promise<string> {
    try {
      const connection = await AirtableConnection.findOne({ userId });

      if (!connection) {
        throw new AuthenticationError("No Airtable connection found for user");
      }

      // Check if we have an access token
      if (!connection.accessToken) {
        throw new AuthenticationError(
          "No OAuth access token available - please use cookie-based authentication"
        );
      }

      // Check if token is in encrypted format
      const { isEncrypted } = require("../utils/encryption");
      if (!isEncrypted(connection.accessToken)) {
        logger.warn("Access token is not encrypted, clearing invalid token", {
          userId,
        });
        // Clear the invalid token
        await AirtableConnection.findOneAndUpdate(
          { userId },
          { $unset: { accessToken: "", refreshToken: "" } }
        );
        throw new AuthenticationError(
          "Invalid token format detected. Token has been cleared. Please re-authenticate."
        );
      }

      // Decrypt access token
      const accessToken = decrypt(connection.accessToken);

      // Try to use current token first
      // If it fails, refresh it
      try {
        // Validate token by making a test request
        await this.validateToken(accessToken);
        return accessToken;
      } catch (error) {
        logger.info("Access token invalid, refreshing", { userId });
        return await this.refreshAccessToken(userId);
      }
    } catch (error) {
      logger.error("Failed to get valid access token", error, { userId });
      throw error;
    }
  }

  /**
   * Validates access token by making a test request
   */
  private async validateToken(accessToken: string): Promise<void> {
    try {
      await axios.get("https://api.airtable.com/v0/meta/bases", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000, // 10 second timeout
        family: 4, // Force IPv4
      });
    } catch (error) {
      const err = error as { response?: { status?: number } };
      // Only throw AuthenticationError for 401, treat other errors as network issues
      // and let the actual API call handle them
      if (err.response?.status === 401) {
        throw new AuthenticationError("Token is invalid");
      }
      // For network errors, consider token valid and let the actual request handle it
      logger.warn("Token validation request failed, but not due to 401", {
        error,
      });
    }
  }

  /**
   * Stores encrypted tokens in database
   */
  private async storeTokens(
    userId: string,
    accessToken: string,
    refreshToken: string
  ): Promise<void> {
    try {
      const encryptedAccessToken = encrypt(accessToken);
      const encryptedRefreshToken = encrypt(refreshToken);

      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      logger.info("Tokens stored successfully", { userId });
    } catch (error) {
      logger.error("Failed to store tokens", error, { userId });
      throw new AirtableError("Failed to store authentication tokens");
    }
  }

  /**
   * Checks if user has a valid connection
   */
  async hasValidConnection(userId: string): Promise<boolean> {
    try {
      const connection = await AirtableConnection.findOne({ userId });
      return Boolean(connection);
    } catch (error) {
      logger.error("Failed to check connection status", error, { userId });
      return false;
    }
  }

  /**
   * Performs login with Puppeteer and extracts ALL cookies
   */
  async performLoginAndExtractCookies(
    email: string,
    password: string,
    existingUserId?: string
  ): Promise<{
    success: boolean;
    error?: string;
    userId?: string;
    cookies?: any[];
    localStorage?: any;
  }> {
    try {
      console.log("[PUPPETEER_LOGIN] Starting login process...");

      // Create a worker pool instance for login
      const workerPool = new WorkerPool("./puppeteerWorker.js", 1);

      try {
        const result = await workerPool.execute<any>({
          type: "login",
          data: {
            email,
            password,
            // No mfaCode - will wait for manual MFA completion
          },
        });

        // Clean up worker pool
        await workerPool.terminate();

        // Type assertion to handle worker result
        const loginResult = result as any;

        if (!loginResult.success) {
          console.error("[PUPPETEER_LOGIN] Login failed:", loginResult.error);
          return {
            success: false,
            error: loginResult.error || "Login failed",
          };
        }

        // Use existing userId or generate new one
        const userId = existingUserId || `user_${Date.now()}`;
        console.log(
          `[PUPPETEER_LOGIN] ${
            existingUserId ? "Using existing" : "Generated new"
          } userId: ${userId}`
        );

        // Store cookies and localStorage in database
        await this.storeCookiesAndData(
          userId,
          loginResult.cookies,
          loginResult.localStorage
        );

        console.log(
          `[PUPPETEER_LOGIN] Login successful! Stored ${
            loginResult.cookies?.length || 0
          } cookies for userId: ${userId}`
        );

        return {
          success: true,
          userId,
          cookies: loginResult.cookies,
          localStorage: loginResult.localStorage,
        };
      } catch (workerError) {
        await workerPool.terminate();
        throw workerError;
      }
    } catch (error) {
      console.error("[PUPPETEER_LOGIN] Error during login:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Stores cookies and localStorage data in database
   */
  private async storeCookiesAndData(
    userId: string,
    cookies: any[],
    localStorage: any
  ): Promise<void> {
    try {
      // Convert cookies to the format expected by our system
      const cookieString = cookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");

      // Encrypt sensitive data
      const encryptedCookies = encrypt(cookieString);
      const encryptedLocalStorage = localStorage
        ? encrypt(JSON.stringify(localStorage))
        : null;

      // Store in database
      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          cookies: encryptedCookies,
          localStorage: encryptedLocalStorage,
          cookiesValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(
        `[COOKIE_STORAGE] Stored cookies and localStorage for user: ${userId}`
      );
    } catch (error) {
      console.error("[COOKIE_STORAGE] Failed to store cookies:", error);
      throw new Error("Failed to store authentication data");
    }
  }
}

export default new AirtableAuthService();
