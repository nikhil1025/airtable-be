import axios from "axios";
import { AirtableConnection } from "../models";
import { logger } from "../utils/errors";

/**
 * ENHANCED COOKIE VALIDATION SERVICE
 * Properly validates and manages all authentication data:
 * - HTTP cookies
 * - localStorage data
 * - Session data
 * - All auth tokens
 */
export class EnhancedCookieValidator {
  /**
   * Comprehensive cookie validation that checks all auth data
   */
  static async validateAllAuthenticationData(userId: string): Promise<{
    isValid: boolean;
    cookies: string;
    localStorage: any;
    sessionData: any;
    message: string;
  }> {
    try {
      console.log("🔍 VALIDATING ALL AUTHENTICATION DATA");
      console.log("-".repeat(40));

      // Get connection data
      const connection = await AirtableConnection.findOne({ userId });

      if (!connection) {
        return {
          isValid: false,
          cookies: "",
          localStorage: null,
          sessionData: null,
          message: "No connection found for user",
        };
      }

      console.log("✅ Connection found in database");
      console.log(`📅 Cookies valid until: ${connection.cookiesValidUntil}`);
      console.log(
        `🗄️ Has localStorage: ${connection.localStorage ? "YES" : "NO"}`
      );
      console.log(
        `💾 Has sessionData: ${(connection as any).sessionData ? "YES" : "NO"}`
      );

      // Check expiration
      if (
        connection.cookiesValidUntil &&
        new Date(connection.cookiesValidUntil) < new Date()
      ) {
        console.log("⚠️ Cookies have expired");
        return {
          isValid: false,
          cookies: connection.cookies || "",
          localStorage: connection.localStorage,
          sessionData: (connection as any).sessionData,
          message: "Cookies have expired",
        };
      }

      // Test cookies with multiple endpoints
      console.log("🧪 Testing cookie validity with multiple endpoints...");

      const testResults = await this.performMultipleAuthTests(
        connection.cookies || ""
      );

      if (testResults.allPassed) {
        console.log("✅ All authentication tests passed");
        return {
          isValid: true,
          cookies: connection.cookies || "",
          localStorage: connection.localStorage,
          sessionData: (connection as any).sessionData,
          message: "All authentication data is valid",
        };
      } else {
        console.log("❌ Some authentication tests failed");
        return {
          isValid: false,
          cookies: connection.cookies || "",
          localStorage: connection.localStorage,
          sessionData: (connection as any).sessionData,
          message: `Authentication tests failed: ${testResults.failures.join(
            ", "
          )}`,
        };
      }
    } catch (error) {
      logger.error("Enhanced cookie validation failed", error);
      return {
        isValid: false,
        cookies: "",
        localStorage: null,
        sessionData: null,
        message: `Validation error: ${(error as any).message}`,
      };
    }
  }

  /**
   * Perform multiple authentication tests
   */
  private static async performMultipleAuthTests(cookies: string): Promise<{
    allPassed: boolean;
    failures: string[];
  }> {
    const failures: string[] = [];
    const testEndpoints = [
      {
        name: "User Profile",
        url: "https://airtable.com/api/me",
        expectedStatus: 200,
      },
      {
        name: "Workspace Access",
        url: "https://airtable.com/api/application",
        expectedStatus: [200, 403], // 403 is okay, means authenticated but no specific workspace
      },
      {
        name: "Settings Access",
        url: "https://airtable.com/api/user/settings",
        expectedStatus: 200,
      },
    ];

    for (const test of testEndpoints) {
      try {
        console.log(`   Testing ${test.name}...`);

        const response = await axios.get(test.url, {
          headers: {
            Cookie: cookies,
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Origin: "https://airtable.com",
            "X-Requested-With": "XMLHttpRequest",
          },
          timeout: 10000,
        });

        const expectedStatuses = Array.isArray(test.expectedStatus)
          ? test.expectedStatus
          : [test.expectedStatus];

        if (expectedStatuses.includes(response.status)) {
          console.log(`   ✅ ${test.name}: ${response.status}`);
        } else {
          console.log(
            `   ❌ ${test.name}: ${
              response.status
            } (expected ${expectedStatuses.join(" or ")})`
          );
          failures.push(test.name);
        }
      } catch (error) {
        console.log(
          `   ❌ ${test.name}: ${
            (error as any).response?.status || "Network Error"
          }`
        );
        failures.push(test.name);
      }
    }

    return {
      allPassed: failures.length === 0,
      failures,
    };
  }

  /**
   * Store comprehensive authentication data
   */
  static async storeCompleteAuthData(
    userId: string,
    cookies: string,
    localStorage: any,
    sessionData: any,
    validUntil: Date
  ): Promise<void> {
    try {
      console.log("💾 STORING COMPLETE AUTHENTICATION DATA");
      console.log("-".repeat(40));

      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          userId,
          cookies,
          localStorage,
          sessionData,
          cookiesValidUntil: validUntil,
          lastUpdated: new Date(),
          authType: "complete", // Mark as complete auth data
        },
        { upsert: true, new: true }
      );

      console.log("✅ All authentication data stored successfully");
      console.log(`📅 Valid until: ${validUntil}`);
      console.log(
        `🗄️ localStorage keys: ${
          localStorage ? Object.keys(localStorage).length : 0
        }`
      );
      console.log(
        `💾 sessionData keys: ${
          sessionData ? Object.keys(sessionData).length : 0
        }`
      );
    } catch (error) {
      logger.error("Failed to store complete auth data", error);
      throw error;
    }
  }

  /**
   * Apply all authentication data to request headers
   */
  static buildCompleteAuthHeaders(
    cookies: string,
    localStorage: any,
    sessionData: any,
    baseId?: string
  ): any {
    const headers: any = {
      Cookie: cookies,
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://airtable.com",
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    };

    // Add referer if baseId provided
    if (baseId) {
      headers["Referer"] = `https://airtable.com/${baseId}`;
    }

    // Add localStorage data as custom headers if needed
    if (localStorage) {
      // Some applications use localStorage data in headers
      if (localStorage.airtableSessionToken) {
        headers["X-Airtable-Session"] = localStorage.airtableSessionToken;
      }
      if (localStorage.userPreferences) {
        headers["X-User-Preferences"] = JSON.stringify(
          localStorage.userPreferences
        );
      }
    }

    // Add session data if needed
    if (sessionData) {
      if (sessionData.csrfToken) {
        headers["X-CSRF-Token"] = sessionData.csrfToken;
      }
    }

    return headers;
  }
}
