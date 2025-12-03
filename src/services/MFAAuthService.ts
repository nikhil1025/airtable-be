import puppeteer, { Browser, Page } from "puppeteer";
import { AirtableConnection, Project } from "../models";
import { encrypt } from "../utils/encryption";
import { logger } from "../utils/errors";
import { authSessionManager } from "./AuthSessionManager";

/**
 * MFA AUTHENTICATION SERVICE
 *
 * Handles headless Puppeteer-based MFA authentication for Airtable
 * Features:
 * - Headless browser automation
 * - Direct input (instant, not letter-by-letter)
 * - Session-based MFA flow
 * - Cookie extraction and storage
 */

export interface InitiateLoginResult {
  success: boolean;
  sessionId?: string;
  requiresMFA: boolean;
  message: string;
  error?: string;
}

export interface SubmitMFAResult {
  success: boolean;
  cookies?: any;
  localStorage?: any;
  message: string;
  error?: string;
}

export class MFAAuthService {
  /**
   * Step 1: Initiate login with email and password
   * Returns sessionId if MFA is required
   */
  async initiateLogin(
    email: string,
    password: string,
    baseId: string,
    userId: string
  ): Promise<InitiateLoginResult> {
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      logger.info("Initiating MFA login", { email, userId, baseId });

      // Launch headless browser (runs in background, not visible)
      browser = await puppeteer.launch({
        headless: true,
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

      page = await browser.newPage();

      // Set viewport and realistic user agent
      await page.setViewport({ width: 1280, height: 720 });

      // Use a more recent and realistic user agent
      await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );

      // Set additional headers to look more like a real browser
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      });

      // Navigate to Airtable login - Use direct sign-in URL
      logger.info("Navigating to Airtable login page");
      await page.goto("https://airtable.com/login", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for page to fully load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Debug: Check what's on the page
      const pageTitle = await page.title();
      const pageUrl = page.url();
      const bodyText = await page.evaluate(() => document.body.innerText);

      logger.info("Page loaded - Debug Info", {
        title: pageTitle,
        url: pageUrl,
        bodyPreview: bodyText.substring(0, 300),
      });

      // Check if we hit a security/captcha page
      if (
        bodyText.includes("Verify it's you") ||
        bodyText.includes("unusual traffic")
      ) {
        logger.warn(
          "Security check detected - need to wait or use different approach"
        );
        // Wait a bit longer for security check to potentially pass
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Try refreshing the page
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      // Check if we're on the right page
      const hasEmailInput = await page.$(
        'input[type="email"], input[name="email"]'
      );

      logger.info("Page analysis", {
        hasEmailInput: !!hasEmailInput,
      });

      // If there's a "Sign in with email and password" link, click it
      if (!hasEmailInput) {
        logger.info("Email input not found, looking for email/password link");

        // Use evaluate to find and click the link
        const clicked = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll("a, button"));
          const emailLink = links.find(
            (el) =>
              el.textContent?.toLowerCase().includes("email") ||
              el.textContent?.toLowerCase().includes("password")
          );
          if (emailLink && emailLink instanceof HTMLElement) {
            emailLink.click();
            return true;
          }
          return false;
        });

        if (clicked) {
          logger.info("Found and clicked email/password link");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

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
        throw new Error("Email input not found");
      }

      logger.info("Entering email");
      await emailInput.click();
      await emailInput.type(email, { delay: 50 });

      // Wait for button to be ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Click Continue button
      const continueBtn = await page.$('button[type="submit"]');
      if (!continueBtn) {
        throw new Error("Continue button not found on email page");
      }

      logger.info("Clicking Continue button");
      await continueBtn.click();

      // Wait for password page to load
      logger.info("Waiting for password page to load");
      await new Promise((resolve) => setTimeout(resolve, 3000));

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
        throw new Error("Password input not found");
      }

      logger.info("Entering password");
      await passwordInput.click();
      await passwordInput.type(password, { delay: 50 });

      // Find and click Sign in button
      logger.info("Looking for Sign in button");
      const signInButton = await page.$('button[type="submit"]');
      if (!signInButton) {
        throw new Error("Sign in button not found");
      }

      logger.info("Clicking Sign in button");
      await signInButton.click();

      // Wait for navigation after login
      logger.info("Waiting for navigation after sign in");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check if MFA is required
      const isMFARequired = await this.checkIfMFARequired(page);

      if (isMFARequired) {
        logger.info("MFA detected - creating session");

        // Create session and store browser instance
        const sessionId = authSessionManager.createSession(
          browser,
          page,
          userId
        );

        return {
          success: true,
          sessionId,
          requiresMFA: true,
          message:
            "Enter your 6-digit MFA code. After submitting, we'll navigate through your workspace to extract all required cookies.",
        };
      } else {
        // No MFA - navigate to multiple pages and extract cookies
        logger.info(
          "No MFA required - navigating to pages to collect all cookies"
        );

        // Navigate to home page
        logger.info("Navigating to home page");
        await page.goto("https://airtable.com/", {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Navigate to workspace page
        logger.info("Navigating to workspace page");
        try {
          await page.goto("https://airtable.com/workspace", {
            waitUntil: "networkidle2",
            timeout: 30000,
          });
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error: any) {
          logger.warn("Failed to navigate to workspace page, continuing", {
            error: error.message,
          });
        }

        // Try to navigate to base, table, and record if available
        try {
          const projects = await Project.find({ userId });
          if (projects.length > 0 && projects[0].airtableBaseId) {
            const baseId = projects[0].airtableBaseId;
            logger.info("Navigating to base page", { baseId });
            await page.goto(`https://airtable.com/${baseId}`, {
              waitUntil: "networkidle2",
              timeout: 30000,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // CRITICAL: Navigate to table and record to get record-level cookies
            const { Table, Ticket } = await import("../models");

            try {
              const table = await Table.findOne({ baseId, userId });

              if (table && table.airtableTableId) {
                const tableId = table.airtableTableId;
                logger.info("Navigating to table view", { tableId });

                await page.goto(`https://airtable.com/${baseId}/${tableId}`, {
                  waitUntil: "networkidle2",
                  timeout: 30000,
                });
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Open a specific record
                const ticket = await Ticket.findOne({
                  baseId,
                  tableId,
                  userId,
                });

                if (ticket && ticket.airtableRecordId) {
                  const recordId = ticket.airtableRecordId;
                  logger.info("Navigating to record view", { recordId });

                  await page.goto(
                    `https://airtable.com/${baseId}/${tableId}/${recordId}`,
                    {
                      waitUntil: "networkidle2",
                      timeout: 30000,
                    }
                  );
                  await new Promise((resolve) => setTimeout(resolve, 3000));
                  logger.info("✓ Record page loaded!");

                  // CRITICAL: Click revision history panel to trigger ALL cookies
                  logger.info("Opening revision history panel...");
                  try {
                    // Wait for revision history panel to be present
                    await page
                      .waitForSelector(
                        '.rowLevelActivityFeed, [class*="rowLevelActivityFeed"], [class*="activityFeed"]',
                        {
                          timeout: 10000,
                        }
                      )
                      .catch(() => {
                        logger.info(
                          "Revision history panel selector not found, trying alternative approach"
                        );
                      });

                    // Click on revision history to ensure it's expanded and cookies are triggered
                    const clicked = await page.evaluate(() => {
                      // Look for "Revision history" text or activity feed elements
                      const revisionElements = Array.from(
                        document.querySelectorAll("div, span, button")
                      );
                      const revisionButton = revisionElements.find(
                        (el) =>
                          el.textContent?.includes("Revision history") ||
                          el.textContent?.includes("revision history")
                      );

                      if (
                        revisionButton &&
                        revisionButton instanceof HTMLElement
                      ) {
                        revisionButton.click();
                        console.log("✓ Clicked revision history button");
                        return true;
                      }

                      // Alternative: Check if revision history panel is already visible
                      const activityFeed = document.querySelector(
                        '.rowLevelActivityFeed, [class*="activityFeed"]'
                      );
                      if (activityFeed) {
                        console.log("✓ Revision history panel already visible");
                        return true;
                      }

                      console.log("Could not find revision history button");
                      return false;
                    });

                    if (clicked) {
                      await new Promise((resolve) => setTimeout(resolve, 2000));
                      logger.info(
                        "✓ Revision history panel opened - all cookies captured!"
                      );
                    } else {
                      logger.warn(
                        "Could not click revision history panel, but continuing"
                      );
                    }
                  } catch (revisionError: any) {
                    logger.warn("Failed to open revision history panel", {
                      error: revisionError.message,
                    });
                  }
                }
              }
            } catch (tableRecordError: any) {
              logger.info("Could not navigate to table/record", {
                error: tableRecordError.message,
              });
            }
          }
        } catch (error: any) {
          logger.warn("Could not navigate to base/table/record pages", {
            error: error.message,
          });
        }

        logger.info("Extracting cookies from all visited pages");
        const cookiesData = await this.extractCookies(page);
        await this.saveCookies(userId, cookiesData);

        await browser.close();

        return {
          success: true,
          requiresMFA: false,
          message: "Login successful - cookies saved",
        };
      }
    } catch (error: any) {
      logger.error("Error during login initiation", { error, userId });

      // Cleanup on error
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          logger.error("Error closing browser", { error: e });
        }
      }

      return {
        success: false,
        requiresMFA: false,
        message: "Login failed",
        error: error.message,
      };
    }
  }

  /**
   * Step 2: Submit MFA code
   */
  async submitMFA(
    sessionId: string,
    mfaCode: string
  ): Promise<SubmitMFAResult> {
    try {
      logger.info("Submitting MFA code", { sessionId });

      // Get session
      const session = authSessionManager.getSession(sessionId);

      if (!session) {
        return {
          success: false,
          message: "Session expired or invalid. Please start login again.",
          error: "SESSION_NOT_FOUND",
        };
      }

      const { page, userId } = session;

      // Find MFA input field and enter code directly
      const mfaInput = await page.$('input[name="code"]');
      if (!mfaInput) {
        // Try alternative selectors
        const altInput = await page.$(
          'input[type="text"][placeholder*="code"]'
        );
        if (!altInput) {
          throw new Error("MFA input field not found");
        }
      }

      logger.info("Entering MFA code");

      // Enter MFA code using type() method (more reliable)
      const mfaInputElement = await page.$('input[name="code"]');
      if (mfaInputElement) {
        await mfaInputElement.click();
        await mfaInputElement.type(mfaCode, { delay: 50 });
      } else {
        throw new Error("MFA input field not found");
      }

      // Wait a bit for the input to be registered
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Submit the form by clicking the label (proven working method from testing)
      logger.info("Submitting MFA form");

      // Click the label element that contains the hidden submit button
      // This is the ONLY method that works based on live testing
      const submitLabel = await page.$("label");
      if (!submitLabel) {
        throw new Error("Submit label not found on MFA page");
      }

      await submitLabel.click();
      logger.info("Submit label clicked, waiting for navigation");

      // Wait longer for navigation after MFA submission
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check if login was successful
      const loginSuccess = await this.checkLoginSuccess(page);

      if (!loginSuccess) {
        throw new Error(
          "MFA verification failed - invalid code or login error"
        );
      }

      logger.info(
        "MFA successful - navigating to workspace and base pages to collect all cookies"
      );

      // Navigate to home page to ensure we have initial cookies
      logger.info("Navigating to home page");
      await page.goto("https://airtable.com/", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Navigate to workspaces page to ensure we have workspace-specific cookies
      logger.info("Navigating to workspaces page");
      try {
        await page.goto("https://airtable.com/workspaces", {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        logger.info("Successfully navigated to workspaces page");
      } catch (error: any) {
        logger.warn("Failed to navigate to workspaces page, continuing", {
          error: error.message,
        });
      }

      // Navigate to workspace billing page to get workspace-level authentication cookies
      logger.info(
        "Fetching workspaceIds from database to navigate to billing pages"
      );
      try {
        const WorkspaceUser = (await import("../models")).WorkspaceUser;
        const workspaceUsers = await WorkspaceUser.find({ userId });

        // Get unique workspace IDs
        const uniqueWorkspaceIds = [
          ...new Set(
            workspaceUsers.map((wu) => wu.workspaceId).filter(Boolean)
          ),
        ];

        if (uniqueWorkspaceIds.length > 0) {
          logger.info(
            `Found ${uniqueWorkspaceIds.length} workspaces to navigate to`,
            {
              workspaceIds: uniqueWorkspaceIds,
            }
          );

          // Navigate to each workspace billing page to collect workspace-specific cookies
          for (const workspaceId of uniqueWorkspaceIds) {
            try {
              logger.info("Navigating to workspace billing page", {
                workspaceId,
              });
              await page.goto(
                `https://airtable.com/${workspaceId}/workspace/billing`,
                {
                  waitUntil: "networkidle2",
                  timeout: 30000,
                }
              );
              await new Promise((resolve) => setTimeout(resolve, 2000));
              logger.info("Successfully navigated to workspace billing page", {
                workspaceId,
              });
            } catch (wsError: any) {
              logger.warn(
                "Failed to navigate to specific workspace billing page, continuing",
                {
                  workspaceId,
                  error: wsError.message,
                }
              );
            }
          }

          logger.info(
            `Completed navigation to all ${uniqueWorkspaceIds.length} workspace billing pages`
          );
        } else {
          logger.info(
            "No workspaceIds found in database, skipping billing page navigation"
          );
        }
      } catch (error: any) {
        logger.warn(
          "Failed to navigate to workspace billing pages, continuing",
          {
            error: error.message,
          }
        );
      }

      // Get the user's base ID from the project
      const projects = await Project.find({ userId });
      if (projects.length > 0 && projects[0].airtableBaseId) {
        const baseId = projects[0].airtableBaseId;
        logger.info(
          "Navigating to base page to collect base-specific cookies",
          { baseId }
        );

        try {
          // First navigate to the base
          await page.goto(`https://airtable.com/${baseId}`, {
            waitUntil: "networkidle2",
            timeout: 30000,
          });
          await new Promise((resolve) => setTimeout(resolve, 3000));
          logger.info("Successfully navigated to base page");

          // CRITICAL: Navigate to table and record to get record-level cookies
          // This is essential for record preview and revision history extraction
          const { Table, Ticket } = await import("../models");

          try {
            // Get the first table for this base
            const table = await Table.findOne({ baseId, userId });

            if (table && table.airtableTableId) {
              const tableId = table.airtableTableId;
              logger.info("Found table, navigating to table view", { tableId });

              // Navigate to table view
              await page.goto(`https://airtable.com/${baseId}/${tableId}`, {
                waitUntil: "networkidle2",
                timeout: 30000,
              });
              await new Promise((resolve) => setTimeout(resolve, 3000));
              logger.info("Successfully navigated to table view");

              // CRITICAL: Open a specific record to get record-preview cookies
              const ticket = await Ticket.findOne({ baseId, tableId, userId });

              if (ticket && ticket.airtableRecordId) {
                const recordId = ticket.airtableRecordId;
                logger.info("Found record, navigating to record view", {
                  recordId,
                });

                // Navigate to specific record - THIS triggers record-level cookies
                await page.goto(
                  `https://airtable.com/${baseId}/${tableId}/${recordId}`,
                  {
                    waitUntil: "networkidle2",
                    timeout: 30000,
                  }
                );
                await new Promise((resolve) => setTimeout(resolve, 4000));
                logger.info(
                  "✓ Successfully navigated to record view - record page loaded!"
                );

                // Verify we're not redirected to login
                const currentUrl = page.url();
                if (!currentUrl.includes("/login")) {
                  logger.info("✓ Record view authenticated successfully");

                  // CRITICAL: Click revision history panel to trigger ALL cookies
                  logger.info("Opening revision history panel...");
                  try {
                    // Wait for revision history panel to be present
                    await page
                      .waitForSelector(
                        '.rowLevelActivityFeed, [class*="rowLevelActivityFeed"], [class*="activityFeed"]',
                        {
                          timeout: 10000,
                        }
                      )
                      .catch(() => {
                        logger.info(
                          "Revision history panel selector not found, trying alternative approach"
                        );
                      });

                    // Click on revision history to ensure it's expanded and cookies are triggered
                    const clicked = await page.evaluate(() => {
                      // Look for "Revision history" text or activity feed elements
                      const revisionElements = Array.from(
                        document.querySelectorAll("div, span, button")
                      );
                      const revisionButton = revisionElements.find(
                        (el) =>
                          el.textContent?.includes("Revision history") ||
                          el.textContent?.includes("revision history")
                      );

                      if (
                        revisionButton &&
                        revisionButton instanceof HTMLElement
                      ) {
                        revisionButton.click();
                        console.log("✓ Clicked revision history button");
                        return true;
                      }

                      // Alternative: Check if revision history panel is already visible
                      const activityFeed = document.querySelector(
                        '.rowLevelActivityFeed, [class*="activityFeed"]'
                      );
                      if (activityFeed) {
                        console.log("✓ Revision history panel already visible");
                        return true;
                      }

                      console.log("Could not find revision history button");
                      return false;
                    });

                    if (clicked) {
                      await new Promise((resolve) => setTimeout(resolve, 2000));
                      logger.info(
                        "✓ Revision history panel opened - all cookies captured!"
                      );
                    } else {
                      logger.warn(
                        "Could not click revision history panel, but continuing"
                      );
                    }
                  } catch (revisionError: any) {
                    logger.warn("Failed to open revision history panel", {
                      error: revisionError.message,
                    });
                  }
                } else {
                  logger.warn("Record navigation redirected to login");
                }
              } else {
                logger.info(
                  "No tickets found for table, skipping record navigation"
                );
              }
            } else {
              logger.info("No tables found for base, trying table selector");

              // Fallback: Try to click the first table in the base UI
              await page
                .waitForSelector(
                  '[data-tutorial-selector-id="firstTableButton"], .table-list a',
                  {
                    timeout: 5000,
                  }
                )
                .catch(() => {
                  logger.info("Table selector not found");
                });

              const firstTable = await page.$(
                '[data-tutorial-selector-id="firstTableButton"], .table-list a'
              );
              if (firstTable) {
                await firstTable.click();
                await new Promise((resolve) => setTimeout(resolve, 3000));
                logger.info("Clicked first table in UI");
              }
            }
          } catch (tableError: any) {
            logger.info(
              "Could not navigate to table/record, continuing with base cookies",
              {
                error: tableError.message,
              }
            );
          }

          // Navigate to the API documentation page to trigger API-related cookies
          logger.info("Navigating to API page for additional cookies");
          try {
            await page.goto(`https://airtable.com/${baseId}/api/docs`, {
              waitUntil: "networkidle2",
              timeout: 30000,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            logger.info("Successfully navigated to API docs page");
          } catch (apiError: any) {
            logger.info("Could not navigate to API docs, continuing", {
              error: apiError.message,
            });
          }
        } catch (error: any) {
          logger.warn(
            "Failed to navigate to base page, continuing with workspace cookies",
            {
              error: error.message,
            }
          );
        }
      } else {
        logger.info("No project found, skipping base page navigation");
      }

      logger.info("Extracting cookies from all visited pages");

      // Extract cookies and localStorage from all pages
      const cookiesData = await this.extractCookies(page);

      // Save to database
      await this.saveCookies(userId, cookiesData);

      // Close session
      await authSessionManager.closeSession(sessionId);

      return {
        success: true,
        cookies: cookiesData.cookies,
        localStorage: cookiesData.localStorage,
        message: "Login successful - cookies saved",
      };
    } catch (error: any) {
      logger.error("Error submitting MFA", { error, sessionId });

      // Cleanup session on error
      await authSessionManager.closeSession(sessionId);

      return {
        success: false,
        message: "MFA submission failed",
        error: error.message,
      };
    }
  }

  /**
   * Cancel authentication session
   */
  async cancelSession(sessionId: string): Promise<void> {
    logger.info("Cancelling auth session", { sessionId });
    await authSessionManager.closeSession(sessionId);
  }

  /**
   * Check if MFA is required
   */
  private async checkIfMFARequired(page: Page): Promise<boolean> {
    try {
      // Check for MFA input field
      const mfaInput = await page.$('input[name="code"]');
      if (mfaInput) return true;

      // Check for alternative MFA indicators
      const bodyText = await page.evaluate(() =>
        document.body.innerText.toLowerCase()
      );
      return (
        bodyText.includes("verification code") ||
        bodyText.includes("two-factor") ||
        bodyText.includes("authenticator") ||
        bodyText.includes("enter code")
      );
    } catch (error) {
      logger.warn("Error checking MFA requirement", { error });
      return false;
    }
  }

  /**
   * Check if login was successful
   */
  private async checkLoginSuccess(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      // If we're on the base page, login was successful
      return url.includes("airtable.com/") && !url.includes("/login");
    } catch (error) {
      logger.warn("Error checking login success", { error });
      return false;
    }
  }

  /**
   * Extract cookies, localStorage, and access token
   * Comprehensive extraction that matches the src implementation
   */
  private async extractCookies(page: Page): Promise<any> {
    logger.info("Starting comprehensive cookie and data extraction");

    // Extract ALL cookies from all domains
    const cookies = await page.cookies();
    logger.info("Extracted cookies", {
      count: cookies.length,
      cookieNames: cookies.map((c) => c.name),
    });

    // Extract localStorage items
    const localStorage = await page.evaluate(() => {
      const items: any = {};
      const ls = (window as any).localStorage;
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key) {
          items[key] = ls.getItem(key) || "";
        }
      }
      return items;
    });

    logger.info("Extracted localStorage", {
      count: Object.keys(localStorage).length,
      keys: Object.keys(localStorage),
    });

    // Try to extract API access token from the authenticated session
    logger.info("Attempting to extract API access token");
    let accessToken: string | null = null;

    try {
      // Method 1: Try to find access token in localStorage
      for (const [key, value] of Object.entries(localStorage)) {
        if (
          key.includes("token") ||
          key.includes("auth") ||
          key.includes("access")
        ) {
          logger.info("Found potential token in localStorage", { key });
          try {
            const parsed = JSON.parse(value as string);
            if (parsed.access_token || parsed.accessToken) {
              accessToken = parsed.access_token || parsed.accessToken;
              logger.info("✓ Found access token in localStorage");
              break;
            }
          } catch (e) {
            // Not JSON, check if it's a direct token
            const val = value as string;
            if (
              val.startsWith("pat") ||
              val.startsWith("key") ||
              val.length > 50
            ) {
              accessToken = val;
              logger.info("✓ Found potential direct access token");
              break;
            }
          }
        }
      }

      // Method 2: Try to extract token from page context
      if (!accessToken) {
        logger.info(
          "No token in localStorage, trying to extract from page context"
        );

        accessToken = await page.evaluate(() => {
          try {
            const win = window as any;
            for (const prop in win) {
              if (
                typeof win[prop] === "string" &&
                (prop.toLowerCase().includes("token") ||
                  prop.toLowerCase().includes("auth")) &&
                win[prop].length > 20
              ) {
                return win[prop];
              }
            }
            return null;
          } catch (error) {
            return null;
          }
        });

        if (accessToken) {
          logger.info("✓ Extracted token from page context");
        }
      }
    } catch (error: any) {
      logger.warn("Error extracting access token", { error: error.message });
    }

    if (!accessToken) {
      logger.info(
        "Could not extract API access token - will rely on cookie-based auth"
      );
    }

    // Return full cookie objects with all properties for proper restoration
    return {
      cookies: cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
      localStorage,
      accessToken: accessToken || null,
    };
  }

  /**
   * Save cookies, localStorage, and accessToken to database
   */
  private async saveCookies(userId: string, cookiesData: any): Promise<void> {
    const cookieString = JSON.stringify(cookiesData.cookies);
    const encryptedCookies = encrypt(cookieString);

    // Encrypt and store localStorage
    const localStorageString = JSON.stringify(cookiesData.localStorage);
    const encryptedLocalStorage = encrypt(localStorageString);

    // Encrypt and store access token if available
    let encryptedAccessToken = null;
    if (cookiesData.accessToken) {
      encryptedAccessToken = encrypt(cookiesData.accessToken);
      logger.info("Access token extracted and will be stored", { userId });
    }

    const updateData: any = {
      cookies: encryptedCookies,
      localStorage: encryptedLocalStorage,
      scrapedAccessToken: encryptedAccessToken,
      cookiesValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      lastUpdated: new Date(),
    };

    await AirtableConnection.findOneAndUpdate({ userId }, updateData, {
      upsert: true,
    });

    logger.info("Cookies, localStorage, and accessToken saved to database", {
      userId,
      cookieCount: cookiesData.cookies.length,
      localStorageCount: Object.keys(cookiesData.localStorage).length,
      hasAccessToken: !!cookiesData.accessToken,
    });
  }
}

// Singleton instance
export const mfaAuthService = new MFAAuthService();
