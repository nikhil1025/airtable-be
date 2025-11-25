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

  /**
   * Get or create worker pool for Puppeteer operations
   */
  private static getWorkerPool(): WorkerPool {
    if (!this.workerPool) {
      const workerFile = path.join(__dirname, "../workers/puppeteerWorker.js");
      this.workerPool = new WorkerPool(workerFile, 4); // Pool of 4 workers
      logger.info("Puppeteer worker pool created", { poolSize: 4 });
    }
    return this.workerPool;
  }

  /**
   * Terminate worker pool on shutdown
   */
  static async shutdownWorkerPool(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.terminate();
      this.workerPool = null;
      logger.info("Puppeteer worker pool terminated");
    }
  }

  /**
   * Get worker pool (public accessor for other services)
   */
  static getWorkerPoolInstance(): WorkerPool {
    return this.getWorkerPool();
  }

  /**
   * Get cookies from database as array format for Puppeteer
   */
  static async getCookiesFromDB(
    userId: string
  ): Promise<Array<{ name: string; value: string }>> {
    const connection = await AirtableConnection.findOne({ userId });

    if (!connection || !connection.cookies) {
      throw new AppError("No cookies found for user", 404, "COOKIES_NOT_FOUND");
    }

    // Decrypt cookies string
    const cookiesStr = decrypt(connection.cookies);

    // Parse cookie string into array format
    const cookieArray = cookiesStr.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return { name, value };
    });

    return cookieArray;
  }

  /**
   * Helper function to wait/sleep
   */
  private static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * AUTOMATIC COOKIE RETRIEVAL - WORKER THREAD VERSION
   * Automatically retrieve cookies from Airtable using Puppeteer automation
   * Runs in a separate worker thread for better performance
   * Use this for production - it's faster and doesn't block the main thread
   */
  static async automaticallyRetrieveCookiesWithWorker(
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<Array<{ name: string; value: string }>> {
    try {
      logger.info("Starting automatic cookie retrieval with Worker Thread", {
        email,
      });

      const workerPool = this.getWorkerPool();

      const result = await workerPool.execute<{
        success: boolean;
        cookies?: Array<{ name: string; value: string }>;
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

      logger.info("Cookies retrieved successfully via worker thread", {
        count: result.cookies.length,
      });

      return result.cookies;
    } catch (error) {
      logger.error("Automatic cookie retrieval with worker failed", { error });
      throw new AppError(
        "Failed to automatically retrieve cookies",
        500,
        "COOKIE_RETRIEVAL_FAILED"
      );
    }
  }

  /**
   * AUTOMATIC COOKIE RETRIEVAL - COMPULSORY METHOD (Original Direct Version)
   * Automatically retrieve cookies from Airtable using Puppeteer automation
   * This extracts cookies without manual user intervention
   * Note: For better performance, use automaticallyRetrieveCookiesWithWorker instead
   */
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

      // STEP 1: Enter email and click Continue
      logger.info("Step 1: Waiting for email input");
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

      // STEP 2: Enter password and submit
      logger.info("Step 2: Waiting for password input");
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

  /**
   * Store automatically retrieved cookies for a user
   */
  static async storeAutomaticCookies(
    userId: string,
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<{ validUntil: Date }> {
    try {
      // Automatically retrieve cookies using Puppeteer Worker Thread (non-blocking)
      logger.info("Using worker thread for cookie extraction", { userId });
      const cookies = await this.automaticallyRetrieveCookiesWithWorker(
        email,
        password,
        mfaCode
      );

      // Encrypt and store
      const cookiesString = JSON.stringify(cookies);
      const encryptedCookies = encrypt(cookiesString);
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await AirtableConnection.findOneAndUpdate(
        { userId },
        {
          cookies: encryptedCookies,
          cookiesValidUntil: validUntil,
        },
        { upsert: true, new: true }
      );

      logger.info("Automatically retrieved cookies stored for user", {
        userId,
        validUntil: validUntil.toISOString(),
      });

      return { validUntil };
    } catch (error) {
      logger.error("Failed to store automatic cookies", error);
      throw error;
    }
  }

  /**
   * Validate stored cookies by making a test request to Airtable
   */
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

      const cookiesString = decrypt(connection.cookies);
      const cookies = JSON.parse(cookiesString) as Array<{
        name: string;
        value: string;
      }>;

      const cookieHeader = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");

      // Test cookies by making request to Airtable
      const response = await axios.get("https://airtable.com", {
        headers: {
          Cookie: cookieHeader,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
      });

      // Check if we got redirected to login
      if (
        response.request?.path?.includes("/login") ||
        response.data?.includes("Sign in")
      ) {
        logger.warn("Cookies invalid - redirected to login", { userId });
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Cookie validation failed", error, { userId });
      return false;
    }
  }

  /**
   * Refresh cookies by automatically retrieving them again
   */
  static async refreshCookies(
    userId: string,
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<{ validUntil: Date }> {
    logger.info("Refreshing cookies automatically", { userId, email });
    return this.storeAutomaticCookies(userId, email, password, mfaCode);
  }

  /**
   * Get valid cookies for making authenticated requests
   * Automatically validates and refreshes if needed
   */
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

  /**
   * Cleanup: close browser instance
   */
  static async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info("Browser instance closed");
    }
  }
}

export default CookieScraperService;
