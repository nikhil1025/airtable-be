import { Request, Response } from "express";
import CookieScraperService from "../services/CookieScraperService";
import { CookiesSetResponse, CookiesValidateResponse } from "../types";
import {
  sendErrorResponse,
  sendSuccessResponse,
  ValidationError,
} from "../utils/errors";

/**
 * POST /api/airtable/cookies/auto-retrieve
 * AUTOMATIC COOKIE EXTRACTION - COMPULSORY METHOD
 * Automatically retrieve cookies from Airtable using Puppeteer automation
 */
export async function autoRetrieveCookies(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { userId, email, password, mfaCode } = req.body;

    if (!userId || !email || !password) {
      throw new ValidationError("userId, email, and password are required");
    }

    const { validUntil } = await CookieScraperService.storeAutomaticCookies(
      userId,
      email,
      password,
      mfaCode
    );

    const response: CookiesSetResponse = {
      success: true,
      message: "Cookies automatically retrieved and stored successfully",
      validUntil,
    };

    return sendSuccessResponse(res, response);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/cookies/validate
 * Checks if stored cookies are valid
 */
export async function validateCookies(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    const isValid = await CookieScraperService.validateCookies(userId);

    // Get connection to get validUntil
    const AirtableConnection = (await import("../models/AirtableConnection"))
      .default;
    const connection = await AirtableConnection.findOne({ userId });

    const response: CookiesValidateResponse = {
      valid: isValid,
      validUntil: connection?.cookiesValidUntil,
      message: isValid ? "Cookies are valid" : "Cookies are invalid or expired",
    };

    return sendSuccessResponse(res, response);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * GET /api/airtable/cookies/get/:userId
 * TEST ONLY: Get raw cookie values for debugging
 * TODO: Remove after testing
 */
export async function getCookiesForTesting(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    const cookiesString = await CookieScraperService.getValidCookies(userId);

    // Parse cookies for display - handle both JSON and HTTP string formats
    let cookies: Array<{ name: string; value: string }>;

    try {
      // Try parsing as JSON array (old format)
      cookies = JSON.parse(cookiesString);
    } catch (jsonError) {
      // Parse HTTP cookie string format: "name1=value1; name2=value2"
      cookies = [];
      if (cookiesString) {
        const cookiePairs = cookiesString.split(";").map((pair) => pair.trim());
        for (const pair of cookiePairs) {
          const [name, ...valueParts] = pair.split("=");
          if (name && valueParts.length > 0) {
            cookies.push({
              name: name.trim(),
              value: valueParts.join("=").trim(), // Join back in case value contains '='
            });
          }
        }
      }
    }

    return sendSuccessResponse(res, { cookies });
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/cookies/refresh
 * Refreshes cookies by automatically retrieving them again
 */
export async function refreshCookies(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { userId, email, password, mfaCode } = req.body;

    if (!userId || !email || !password) {
      throw new ValidationError("userId, email, and password are required");
    }

    const { validUntil } = await CookieScraperService.refreshCookies(
      userId,
      email,
      password,
      mfaCode
    );

    const response: CookiesSetResponse = {
      success: true,
      message: "Cookies refreshed automatically",
      validUntil,
    };

    return sendSuccessResponse(res, response);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export default {
  autoRetrieveCookies,
  validateCookies,
  refreshCookies,
  getCookiesForTesting,
};
