import axios from "axios";
import path from "path";
import puppeteer, { Browser, Page } from "puppeteer";
import AirtableConnection from "../models/AirtableConnection";
import { decrypt, encrypt } from "../utils/encryption";
import { AppError, logger } from "../utils/errors";
import { WorkerPool } from "../workers/WorkerPool";

export class CookieScraperService {
  private static browser: Browser | null = null;
  private static workerPool: WorkerPool | null = null;

  private static getWorkerPool(): WorkerPool {
    if (!this.workerPool) {
      const workerFile = path.join(__dirname, "../workers/puppeteerWorker.js");
      // Use CPU count - 1, minimum 4, maximum 10
      const cpuCount = require("os").cpus().length;
      const poolSize = Math.min(Math.max(cpuCount - 1, 4), 10);
      this.workerPool = new WorkerPool(workerFile, poolSize);
      logger.info("Puppeteer worker pool created", {
        poolSize,
        cpuCount,
        message: `Using ${poolSize} workers for parallel scraping`,
      });
    }
    return this.workerPool;
  }

  static async shutdownWorkerPool(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.terminate();
      this.workerPool = null;
      logger.info("Puppeteer worker pool terminated");
    }
  }

  static getWorkerPoolInstance(): WorkerPool {
    return this.getWorkerPool();
  }

  static async getCookiesFromDB(userId: string): Promise<Array<any>> {
    const connection = await AirtableConnection.findOne({ userId });

    if (!connection || !connection.cookies) {
      throw new AppError("No cookies found for user", 404, "COOKIES_NOT_FOUND");
    }

    // Decrypt cookies string
    const cookiesStr = decrypt(connection.cookies);

    // Parse cookies - they're already in full format from login
    try {
      const cookiesArray = JSON.parse(cookiesStr);

      // Return cookies with all their properties
      return cookiesArray.map((cookie: any) => {
        const puppeteerCookie: any = {
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || "/",
        };

        if (!cookie.name.startsWith("__Host-")) {
          puppeteerCookie.domain = cookie.domain;
        }

        // Add optional fields
        if (cookie.expires) puppeteerCookie.expires = cookie.expires;
        if (cookie.httpOnly !== undefined)
          puppeteerCookie.httpOnly = cookie.httpOnly;
        if (cookie.secure !== undefined) puppeteerCookie.secure = cookie.secure;
        if (cookie.sameSite) puppeteerCookie.sameSite = cookie.sameSite;

        return puppeteerCookie;
      });
    } catch (e) {
      const cookieArray = cookiesStr.split("; ").map((cookie) => {
        const [name, value] = cookie.split("=");
        return {
          name,
          value,
          domain: ".airtable.com",
          path: "/",
        };
      });
      return cookieArray;
    }
  }

  static async getLocalStorageFromDB(
    userId: string
  ): Promise<Record<string, string>> {
    const connection = await AirtableConnection.findOne({ userId });

    if (!connection || !connection.localStorage) {
      return {}; // Return empty object if no localStorage
    }

    try {
      // Decrypt and parse localStorage
      const localStorageStr = decrypt(connection.localStorage);
      return JSON.parse(localStorageStr);
    } catch (e) {
      logger.warn("Failed to parse localStorage", { error: e });
      return {};
    }
  }

  private static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async automaticallyRetrieveCookiesWithWorker(
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<{
    cookies: Array<any>;
    localStorage: Record<string, string>;
    accessToken: string | null;
  }> {
    try {
      logger.info("Starting automatic cookie retrieval with Worker Thread", {
        email,
      });

      const workerPool = this.getWorkerPool();

      const result = await workerPool.execute<{
        success: boolean;
        cookies?: Array<any>;
        localStorage?: Record<string, string>;
        accessToken?: string | null;
        error?: string;
      }>({
        type: "login",
        data: { email, password, mfaCode },
      });

      if (!result.success || !result.cookies) {
        throw new AppError(
          result.error || "Failed to retrieve cookies",
          500,
          "COOKIE_RETRIEVAL_FAILED"
        );
      }

      logger.info(
        "Cookies and localStorage retrieved successfully via worker thread",
        {
          cookiesCount: result.cookies.length,
          localStorageCount: Object.keys(result.localStorage || {}).length,
        }
      );

      return {
        cookies: result.cookies,
        localStorage: result.localStorage || {},
        accessToken: result.accessToken || null,
      };
    } catch (error) {
      logger.error("Automatic cookie retrieval with worker failed", { error });
      throw new AppError(
        "Failed to automatically retrieve cookies",
        500,
        "COOKIE_RETRIEVAL_FAILED"
      );
    }
  }

  static async automaticallyRetrieveCookies(
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<Array<{ name: string; value: string }>> {
    let page: Page | null = null;

    try {
      logger.info("Starting automatic cookie retrieval with Puppeteer", {
        email,
      });

      // Launch browser
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: process.env.PUPPETEER_HEADLESS !== "false", // Set PUPPETEER_HEADLESS=false for debugging
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
          ],
        });
        logger.info("Puppeteer browser launched", {
          headless: process.env.PUPPETEER_HEADLESS !== "false",
        });
      }

      page = await this.browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });

      // Navigate to Airtable login - Use direct sign-in URL to avoid Google SSO
      logger.info("Navigating to Airtable email/password login");
      await page.goto("https://airtable.com/login?continue=%2F", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait a bit for page to fully load
      await this.sleep(2000);

      // Take screenshot for debugging
      const timestamp = Date.now();
      await page.screenshot({ path: `/tmp/airtable-step1-${timestamp}.png` });
      logger.info("Initial page screenshot saved");

      // Enter email and click Continue
      logger.info("Waiting for email input");
      await page.waitForSelector('input[type="email"], input[name="email"]', {
        visible: true,
        timeout: 10000,
      });

      const emailInput = await page.$(
        'input[type="email"], input[name="email"]'
      );
      if (!emailInput) {
        throw new AppError("Email input not found", 500, "LOGIN_ERROR");
      }

      logger.info("Entering email");
      await emailInput.click();
      await emailInput.type(email, { delay: 50 });

      await page.screenshot({
        path: `/tmp/airtable-step2-email-${timestamp}.png`,
      });
      logger.info("Email entered screenshot saved");

      // Find and click "Continue" button
      // The Continue button is a submit button on the email page
      logger.info("Looking for Continue button");

      // Wait for the button to be ready
      await this.sleep(1000);

      // The Continue button is a submit button on email page
      const continueBtn = await page.$('button[type="submit"]');

      if (!continueBtn) {
        throw new AppError(
          "Continue button not found on email page",
          500,
          "LOGIN_ERROR"
        );
      }

      logger.info("Clicking Continue button");
      await continueBtn.click();

      // Wait for password page to load
      logger.info("Waiting for password page to load");
      await this.sleep(3000);

      await page.screenshot({
        path: `/tmp/airtable-step3-password-page-${timestamp}.png`,
      });
      logger.info("Password page screenshot saved");

      // Enter password and submit
      logger.info("Waiting for password input");
      await page.waitForSelector(
        'input[type="password"], input[name="password"]',
        {
          visible: true,
          timeout: 10000,
        }
      );

      const passwordInput = await page.$(
        'input[type="password"], input[name="password"]'
      );
      if (!passwordInput) {
        throw new AppError("Password input not found", 500, "LOGIN_ERROR");
      }

      logger.info("Entering password");
      await passwordInput.click();
      await passwordInput.type(password, { delay: 50 });

      await page.screenshot({
        path: `/tmp/airtable-step4-password-entered-${timestamp}.png`,
      });
      logger.info("Password entered screenshot saved");

      // Find and click submit button
      logger.info("Looking for Sign in button");
      const signInButton = await page.$('button[type="submit"]');
      if (!signInButton) {
        throw new AppError("Sign in button not found", 500, "LOGIN_ERROR");
      }

      logger.info("Clicking Sign in button");
      await signInButton.click();

      // Wait for navigation after login
      logger.info("Waiting for navigation after sign in");
      await this.sleep(3000);

      await page.screenshot({
        path: `/tmp/airtable-step5-after-signin-${timestamp}.png`,
      });
      logger.info("After sign in screenshot saved");

      // Check if MFA is required
      const currentUrl = page.url();
      const pageContent = await page.content();
      const needsMFA =
        currentUrl.includes("mfa") ||
        currentUrl.includes("verify") ||
        currentUrl.includes("two-factor") ||
        pageContent.includes("verification code") ||
        pageContent.includes("authenticator");

      if (needsMFA) {
        logger.info("MFA detected");

        if (!mfaCode) {
          throw new AppError(
            "MFA code required but not provided. Please provide MFA code from your authenticator app.",
            400,
            "MFA_REQUIRED"
          );
        }

        logger.info("Entering MFA code");

        // Wait for MFA input field
        await this.sleep(1000);

        // Try different MFA input selectors
        const mfaInput = await page.$(
          'input[name="verificationCode"], input[name="code"], input[type="text"][inputmode="numeric"], input[placeholder*="code" i]'
        );

        if (!mfaInput) {
          throw new AppError("MFA input field not found", 500, "MFA_ERROR");
        }

        await mfaInput.click();
        await mfaInput.type(mfaCode, { delay: 50 });

        await page.screenshot({ path: `/tmp/airtable-mfa-${timestamp}.png` });
        logger.info("MFA code entered screenshot saved");

        // Submit MFA
        const mfaSubmit = await page.$('button[type="submit"]');
        if (mfaSubmit) {
          await mfaSubmit.click();
          logger.info("MFA submitted, waiting for verification");
          await this.sleep(3000);
        }
      }

      // Wait a bit for final redirect
      await this.sleep(2000);

      const finalUrl = page.url();
      logger.info("Final URL after authentication", { url: finalUrl });

      // Verify we're logged in (should not be on login/signin page)
      if (finalUrl.includes("/login") || finalUrl.includes("/signin")) {
        await page.screenshot({
          path: `/tmp/airtable-failed-${timestamp}.png`,
        });
        throw new AppError(
          "Login failed - still on login page. Please check credentials.",
          401,
          "LOGIN_FAILED"
        );
      }

      logger.info("Successfully logged in, extracting cookies");

      // Extract all cookies from airtable.com domain
      const cookies = await page.cookies("https://airtable.com");

      if (cookies.length === 0) {
        throw new AppError(
          "No cookies found after login",
          500,
          "NO_COOKIES_FOUND"
        );
      }

      logger.info("Cookies extracted successfully", {
        count: cookies.length,
        cookieNames: cookies.map((c: any) => c.name),
      });

      // Return normalized cookies
      return cookies.map((c: any) => ({ name: c.name, value: c.value }));
    } catch (error) {
      logger.error("Failed to automatically retrieve cookies", error);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  static async storeAutomaticCookies(
    userId: string,
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<{ validUntil: Date }> {
    try {
      // Automatically retrieve cookies using Puppeteer Worker Thread
      logger.info("Using worker thread for cookie extraction", { userId });
      const result = await this.automaticallyRetrieveCookiesWithWorker(
        email,
        password,
        mfaCode
      );
      const { cookies, localStorage, accessToken } = result;

      // Encrypt and store cookies
      const cookiesString = JSON.stringify(cookies);
      const encryptedCookies = encrypt(cookiesString);

      // Encrypt and store localStorage
      const localStorageString = JSON.stringify(localStorage);
      const encryptedLocalStorage = encrypt(localStorageString);

      // Encrypt and store access token if available
      let encryptedAccessToken = null;
      if (accessToken) {
        encryptedAccessToken = encrypt(accessToken);
        logger.info("Access token extracted and will be stored", { userId });
      } else {
        logger.warn("No access token found during extraction", { userId });
      }

      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Get existing connection to preserve OAuth tokens
      const existingConnection = await AirtableConnection.findOne({ userId });

      // Prepare update object, storing scraped tokens separately to preserve OAuth tokens
      const updateData: any = {
        cookies: encryptedCookies,
        localStorage: encryptedLocalStorage,
        scrapedAccessToken: encryptedAccessToken, // Store in separate field
        cookiesValidUntil: validUntil,
      };

      logger.info("Storing scraped data without affecting OAuth tokens", {
        userId,
        hasScrapedToken: !!accessToken,
        hasExistingOAuthTokens: !!(
          existingConnection?.accessToken && existingConnection?.refreshToken
        ),
      });

      await AirtableConnection.findOneAndUpdate({ userId }, updateData, {
        upsert: true,
        new: true,
      });

      logger.info(
        "Automatically retrieved cookies and localStorage stored for user",
        {
          userId,
          cookiesCount: cookies.length,
          localStorageCount: Object.keys(localStorage).length,
          hasAccessToken: !!accessToken,
          validUntil: validUntil.toISOString(),
        }
      );

      return { validUntil };
    } catch (error) {
      logger.error("Failed to store automatic cookies", error);
      throw error;
    }
  }

  static async validateCookies(userId: string): Promise<boolean> {
    try {
      const connection = await AirtableConnection.findOne({ userId });

      if (!connection || !connection.cookies) {
        return false;
      }

      if (
        !connection.cookiesValidUntil ||
        connection.cookiesValidUntil < new Date()
      ) {
        return false;
      }

      // Check if cookies were extracted recently (within last 5 minutes)
      const now = new Date();
      const cookieAge = now.getTime() - connection.createdAt.getTime();
      const fiveMinutesInMs = 5 * 60 * 1000;

      if (cookieAge < fiveMinutesInMs) {
        console.log(
          " Cookies are fresh (extracted within last 5 minutes), skipping network validation"
        );
        logger.info("Cookies validated as fresh", {
          userId,
          ageSeconds: Math.round(cookieAge / 1000),
        });
        return true;
      }

      const cookiesString = decrypt(connection.cookies);

      console.log(" DEBUG: Raw decrypted cookie string:");
      console.log("First 200 chars:", cookiesString.substring(0, 200));
      console.log("Type:", typeof cookiesString);
      console.log("Length:", cookiesString.length);

      // Helper function to parse HTTP cookie string format
      const parseCookies = (cookieString: string) => {
        const cookies: Array<{ name: string; value: string }> = [];
        if (!cookieString) return cookies;

        const cookiePairs = cookieString.split(";").map((pair) => pair.trim());
        for (const pair of cookiePairs) {
          const [name, ...valueParts] = pair.split("=");
          if (name && valueParts.length > 0) {
            cookies.push({
              name: name.trim(),
              value: valueParts.join("=").trim(), // Join back in case value contains '='
            });
          }
        }
        return cookies;
      };

      let cookieHeader: string;
      let parsedCookies: Array<{ name: string; value: string }>;

      try {
        // Try parsing as JSON array (old format)
        console.log(" Attempting JSON parse...");
        parsedCookies = JSON.parse(cookiesString) as Array<{
          name: string;
          value: string;
        }>;
        console.log(
          " JSON parse successful, cookie count:",
          parsedCookies.length
        );
        cookieHeader = parsedCookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
      } catch (jsonError) {
        console.log(" JSON parse failed:", (jsonError as Error).message);
        console.log(" Parsing as HTTP cookie string format (new auth system)");

        // Parse HTTP cookie string format: "name1=value1; name2=value2"
        parsedCookies = parseCookies(cookiesString);
        console.log(
          " HTTP cookie parsing successful, cookie count:",
          parsedCookies.length
        );
        cookieHeader = cookiesString; // Already in correct format
      }

      console.log(
        " Final cookie header (first 200 chars):",
        cookieHeader.substring(0, 200)
      );

      // For recently extracted cookies (within 10 minutes), try simplified validation
      if (cookieAge < 10 * 60 * 1000) {
        console.log(
          " Cookies are relatively fresh, using simplified validation"
        );

        // Check if key Airtable cookies are present
        const hasSessionCookie =
          cookieHeader.includes("airtable-session") ||
          cookieHeader.includes("login-status");
        const hasAuthCookies =
          cookieHeader.includes("userSignature") ||
          cookieHeader.includes("mbpg");

        if (hasSessionCookie && hasAuthCookies) {
          console.log(" Key authentication cookies found, assuming valid");
          logger.info("Cookies validated by presence check", { userId });
          return true;
        }
      }

      // Test cookies by making request to actual workspace
      console.log(" Testing cookies against workspace page...");

      try {
        const response = await axios.get(
          "https://airtable.com/appMeCVHbYCljHyu5",
          {
            headers: {
              Cookie: cookieHeader,
              "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            },
            timeout: 15000,
            maxRedirects: 2,
            validateStatus: (status) => status < 500,
          }
        );

        console.log(" Workspace Response Status:", response.status);

        // Check if we got successful workspace access
        if (response.status === 200) {
          const responseText = response.data.toString();
          // Check for indicators that we're authenticated and in a workspace
          if (
            responseText.includes("airtable-session") ||
            responseText.includes("workspace") ||
            responseText.includes("application") ||
            (!responseText.includes("Sign in") &&
              !responseText.includes("login"))
          ) {
            console.log(
              " Workspace validation successful - authenticated access confirmed"
            );
            logger.info("Cookies validated successfully against workspace", {
              userId,
            });
            return true;
          }
        }

        // If workspace test fails, cookies likely need refresh
        console.log(" Workspace validation failed - cookies may be expired");
        logger.warn("Workspace validation failed", {
          userId,
          status: response.status,
        });
        return false;
      } catch (networkError: any) {
        console.log(
          "[ERROR] Network error during workspace validation:",
          networkError.message
        );

        // For fresh cookies with network errors, be lenient
        if (cookieAge < 10 * 60 * 1000) {
          console.log(
            "⚡ Network issues but cookies are fresh - assuming valid"
          );
          logger.info(
            "Cookies assumed valid due to network issues and freshness",
            { userId }
          );
          return true;
        }

        logger.warn("Network validation failed for older cookies", {
          userId,
          error: networkError.message,
        });
        return false;
      }
    } catch (error) {
      logger.error("Cookie validation failed", error, { userId });
      return false;
    }
  }

  static async refreshCookies(
    userId: string,
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<{ validUntil: Date }> {
    logger.info("Refreshing cookies automatically", { userId, email });
    return this.storeAutomaticCookies(userId, email, password, mfaCode);
  }

  static async getValidCookies(userId: string): Promise<string> {
    const connection = await AirtableConnection.findOne({ userId });

    if (!connection || !connection.cookies) {
      throw new AppError("No cookies found for user", 404, "COOKIES_NOT_FOUND");
    }

    if (
      !connection.cookiesValidUntil ||
      connection.cookiesValidUntil < new Date()
    ) {
      throw new AppError(
        "Cookies expired. Please refresh cookies.",
        401,
        "COOKIES_EXPIRED"
      );
    }

    const isValid = await this.validateCookies(userId);
    if (!isValid) {
      throw new AppError(
        "Cookies are invalid. Please refresh cookies.",
        401,
        "COOKIES_INVALID"
      );
    }

    return decrypt(connection.cookies);
  }

  static async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info("Browser instance closed");
    }
  }
}

export default CookieScraperService;
