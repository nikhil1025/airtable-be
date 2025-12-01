import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";

/**
 * Puppeteer Worker Thread
 * Offloads CPU-intensive browser automation to separate thread
 */

interface WorkerTask {
  type: "login" | "scrape" | "scrapeRevisionHistory";
  data: {
    email?: string;
    password?: string;
    mfaCode?: string;
    url?: string;
    baseId?: string;
    tableId?: string;
    recordId?: string;
    rowId?: string;
    cookies?: Array<{ name: string; value: string; domain?: string }>;
    localStorage?: Record<string, string>;
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleLogin(data: any): Promise<any> {
  const { email, password } = data;
  let browser = null;
  let page = null;

  try {
    // Launch browser in non-headless mode for MFA handling
    const isHeadless = false; // Always show browser for MFA
    console.log(
      `[PUPPETEER_WORKER] Launching browser (headless: ${isHeadless}) for MFA handling...`
    );

    browser = await puppeteer.launch({
      headless: isHeadless,
      executablePath: "/usr/bin/google-chrome",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-sync",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
      ],
    });
    console.log("[PUPPETEER_WORKER] Browser launched successfully");

    page = await browser.newPage();
    console.log("[PUPPETEER_WORKER] New page created");
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to login
    console.log("[PUPPETEER_WORKER] Navigating to Airtable login...");
    await page.goto("https://airtable.com/login?continue=%2F", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    console.log("[PUPPETEER_WORKER] Login page loaded");

    await sleep(2000);

    // Enter email
    await page.waitForSelector('input[type="email"]', {
      visible: true,
      timeout: 10000,
    });
    const emailInput = await page.$('input[type="email"]');
    if (!emailInput) throw new Error("Email input not found");

    await emailInput.click();
    await emailInput.type(email, { delay: 50 });
    await sleep(1000);

    // Click continue
    const continueBtn = await page.$('button[type="submit"]');
    if (!continueBtn) throw new Error("Continue button not found");
    await continueBtn.click();
    await sleep(3000);

    // Enter password
    await page.waitForSelector('input[type="password"]', {
      visible: true,
      timeout: 10000,
    });
    const passwordInput = await page.$('input[type="password"]');
    if (!passwordInput) throw new Error("Password input not found");

    await passwordInput.click();
    await passwordInput.type(password, { delay: 50 });
    await sleep(1000);

    // Click sign in
    const signInBtn = await page.$('button[type="submit"]');
    if (!signInBtn) throw new Error("Sign in button not found");
    await signInBtn.click();
    await sleep(3000);

    // Handle MFA if needed - ALWAYS wait for manual completion
    let currentUrl = page.url();
    if (
      currentUrl.includes("mfa") ||
      currentUrl.includes("verify") ||
      currentUrl.includes("2fa") ||
      currentUrl.includes("auth/verify")
    ) {
      console.log(
        "\n[MFA] MFA REQUIRED - Please complete MFA in the browser window"
      );
      console.log("[INFO] Enter your MFA code and click Submit button");
      console.log("[WAIT] Waiting for you to complete authentication...\n");

      // Wait for navigation away from MFA page (up to 300 seconds)
      try {
        await page.waitForFunction(
          () => {
            const url = (globalThis as any).location.href;
            return (
              !url.includes("mfa") &&
              !url.includes("verify") &&
              !url.includes("2fa") &&
              !url.includes("auth/verify") &&
              !url.includes("/login")
            );
          },
          { timeout: 300000 } // 5 minutes
        );
        console.log(" MFA completed successfully!");
        await sleep(5000); // Wait for session to fully stabilize
      } catch (error) {
        throw new Error(
          "MFA_TIMEOUT: User did not complete MFA within 5 minutes"
        );
      }
    }

    // Wait for successful authentication - ensure we're on airtable.com workspace
    console.log("[PUPPETEER_WORKER] Waiting for successful authentication...");
    try {
      await page.waitForFunction(
        () => {
          const url = (globalThis as any).location.href;
          return (
            url.includes("airtable.com") &&
            !url.includes("/login") &&
            !url.includes("/mfa") &&
            !url.includes("/verify")
          );
        },
        { timeout: 60000 }
      );
      console.log(
        "[PUPPETEER_WORKER] Authentication successful! On workspace page"
      );
      await sleep(2000); // Let cookies settle
    } catch (error) {
      throw new Error(
        "AUTHENTICATION_FAILED: Did not reach workspace page after login"
      );
    }

    // IMPORTANT: Navigate to the specific workspace/base to establish proper session context
    console.log(
      "[PUPPETEER_WORKER] Navigating to target workspace to establish session..."
    );
    const targetBase = "appMeCVHbYCljHyu5"; // The base we're working with
    try {
      await page.goto(`https://airtable.com/${targetBase}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await sleep(3000); // Wait for workspace to fully load
      console.log(
        `[PUPPETEER_WORKER] Successfully navigated to base: ${targetBase}`
      );
    } catch (error) {
      console.error(
        "[PUPPETEER_WORKER] Warning: Could not navigate to specific base, using general cookies"
      );
    }

    // Wait for page to be fully loaded
    await sleep(2000);

    // Navigate to multiple Airtable pages to collect ALL possible cookies
    console.log(
      "[PUPPETEER_WORKER] Navigating to collect all cookies from different Airtable pages..."
    );

    // Visit main dashboard
    await page.goto("https://airtable.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(2000);

    // Visit workspace
    await page.goto("https://airtable.com/workspace", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(2000);

    // Extract ALL cookies from all domains after visiting multiple pages
    const allCookies = await page.cookies();
    console.log(
      `[PUPPETEER_WORKER] Extracted ${allCookies.length} cookies from all domains after visiting multiple pages`
    );
    console.log(
      `[PUPPETEER_WORKER] Cookie names: ${allCookies
        .map((c) => c.name)
        .join(", ")}`
    );

    // Extract localStorage items
    const localStorageData = await page.evaluate(() => {
      const items: Record<string, string> = {};
      const ls = (globalThis as any).localStorage;
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key) {
          items[key] = ls.getItem(key) || "";
        }
      }
      return items;
    });
    console.log(
      `[PUPPETEER_WORKER] Extracted ${
        Object.keys(localStorageData).length
      } localStorage items`
    );

    // Try to extract API access token from the authenticated session
    console.log("[PUPPETEER_WORKER] Attempting to extract API access token...");
    let accessToken: string | null = null;

    try {
      // Method 1: Try to find access token in localStorage
      for (const [key, value] of Object.entries(localStorageData)) {
        if (
          key.includes("token") ||
          key.includes("auth") ||
          key.includes("access")
        ) {
          console.log(
            `[PUPPETEER_WORKER] Found potential token in localStorage: ${key}`
          );
          try {
            const parsed = JSON.parse(value);
            if (parsed.access_token || parsed.accessToken) {
              accessToken = parsed.access_token || parsed.accessToken;
              console.log(
                "[PUPPETEER_WORKER]  Found access token in localStorage"
              );
              break;
            }
          } catch (e) {
            // Not JSON, check if it's a direct token
            if (
              value.startsWith("pat") ||
              value.startsWith("key") ||
              value.length > 50
            ) {
              accessToken = value;
              console.log(
                "[PUPPETEER_WORKER]  Found potential direct access token"
              );
              break;
            }
          }
        }
      }

      // Method 2: Try to intercept API calls to get the access token
      if (!accessToken) {
        console.log(
          "[PUPPETEER_WORKER] No token in localStorage, trying to capture from API calls..."
        );

        // Set up request interception to capture Authorization headers
        let tokenFromRequest: string | null = null;

        page.on("request", (request) => {
          const authHeader = request.headers()["authorization"];
          if (
            authHeader &&
            authHeader.startsWith("Bearer ") &&
            !tokenFromRequest
          ) {
            tokenFromRequest = authHeader.replace("Bearer ", "");
            console.log(
              "[PUPPETEER_WORKER]  Captured access token from API request"
            );
          }
        });

        // Make a request that would use the API to trigger token capture
        await page.goto("https://airtable.com/workspace", {
          waitUntil: "networkidle0",
          timeout: 30000,
        });

        await sleep(3000); // Wait for any API calls to complete

        if (tokenFromRequest) {
          accessToken = tokenFromRequest;
        }
      }

      // Method 3: Try to execute a test API call from within the page context to get token
      if (!accessToken) {
        console.log(
          "[PUPPETEER_WORKER] Attempting to extract token by making test API call..."
        );

        accessToken = await page.evaluate(async () => {
          try {
            // Try to make an API call and capture the token from the request
            await fetch("/api/v0/meta/bases?maxRecords=1", {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            });

            // The token might be in the request headers - this is a bit tricky to capture from client-side
            // Let's check if there's any global token variable
            // @ts-ignore - window is available in browser context
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
            console.log("API call failed:", error);
            return null;
          }
        });

        if (accessToken) {
          console.log("[PUPPETEER_WORKER]  Extracted token from page context");
        }
      }
    } catch (error) {
      console.error("[PUPPETEER_WORKER] Error extracting access token:", error);
    }

    if (!accessToken) {
      console.log(
        "[PUPPETEER_WORKER]  Could not extract API access token - will rely on cookie-based auth"
      );
    }

    return {
      success: true,
      cookies: allCookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
      localStorage: localStorageData,
      accessToken: accessToken || null,
    };
  } catch (error) {
    console.error("[PUPPETEER_WORKER] Login error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    };
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

async function handleScrape(data: any): Promise<any> {
  const { url, cookies } = data;
  let browser = null;
  let page = null;

  try {
    const isHeadless = process.env.PUPPETEER_HEADLESS !== "false";
    console.log(
      `[PUPPETEER_WORKER] Launching browser for scraping (headless: ${isHeadless})...`
    );

    browser = await puppeteer.launch({
      headless: isHeadless,
      executablePath: "/usr/bin/google-chrome",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    page = await browser.newPage();
    console.log("[PUPPETEER_WORKER] Setting cookies for scraping...");

    // Set cookies
    await page.setCookie(...cookies);

    // Navigate and scrape
    console.log(`[PUPPETEER_WORKER] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const content = await page.content();
    console.log("[PUPPETEER_WORKER] Content scraped successfully");

    return {
      success: true,
      content,
    };
  } catch (error) {
    console.error("[PUPPETEER_WORKER] Scrape error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

async function handleScrapeRevisionHistory(data: any): Promise<any> {
  const {
    baseId,
    tableId,
    recordId,
    rowId,
    cookies,
    localStorage: localStorageData,
    viewId: providedViewId,
  } = data;
  let browser = null;
  let page = null;

  try {
    const isHeadless = process.env.PUPPETEER_HEADLESS !== "false";
    console.log(
      `[PUPPETEER_WORKER] Fetching revision history for record ${recordId} using internal API...`
    );

    browser = await puppeteer.launch({
      headless: isHeadless,
      executablePath: "/usr/bin/google-chrome",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    page = await browser.newPage();

    // Set a realistic User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    });

    // First navigate to the SPECIFIC BASE to establish proper context
    console.log(
      "[PUPPETEER_WORKER] Establishing domain context by navigating to base..."
    );
    await page.goto(`https://airtable.com/${baseId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await sleep(2000); // Let base load

    // NOW set cookies after domain/base context is established
    console.log("[PUPPETEER_WORKER] Setting authentication cookies...");
    console.log(`[PUPPETEER_WORKER] Total cookies to set: ${cookies.length}`);

    // Set cookies one by one to catch failures
    let successCount = 0;
    const failedCookies: string[] = [];
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
        successCount++;
      } catch (err) {
        const error = err as Error;
        console.log(
          `[PUPPETEER_WORKER] Failed to set cookie ${cookie.name}:`,
          error.message
        );
        failedCookies.push(cookie.name);
      }
    }
    console.log(
      `[PUPPETEER_WORKER] Cookies set successfully: ${successCount}/${cookies.length}`
    );
    if (failedCookies.length > 0) {
      console.log(
        `[PUPPETEER_WORKER] Failed cookies:`,
        failedCookies.join(", ")
      );
    }

    // Restore localStorage AFTER navigation
    if (localStorageData && Object.keys(localStorageData).length > 0) {
      console.log(
        `[PUPPETEER_WORKER] Restoring ${
          Object.keys(localStorageData).length
        } localStorage items...`
      );
      await page.evaluate((data) => {
        const ls = (globalThis as any).localStorage;
        for (const [key, value] of Object.entries(data)) {
          ls.setItem(key, value);
        }
      }, localStorageData);
      console.log("[PUPPETEER_WORKER] localStorage restored successfully");
    }

    // Verify cookies were set and identify which ones are missing
    const setCookies = await page.cookies();
    const setCookieNames = new Set(setCookies.map((c) => c.name));
    const missingCookies = cookies
      .filter((c: any) => !setCookieNames.has(c.name))
      .map((c: any) => c.name);
    console.log(
      `[PUPPETEER_WORKER] Actual cookies in browser: ${setCookies.length}`
    );
    if (missingCookies.length > 0) {
      console.log(
        `[PUPPETEER_WORKER] Missing cookies:`,
        missingCookies.join(", ")
      );
    }
    console.log(
      `[PUPPETEER_WORKER] Present cookies:`,
      setCookies.map((c) => c.name).join(", ")
    );

    // Reload the page to ensure cookies are properly applied
    console.log("[PUPPETEER_WORKER] Reloading to apply cookies...");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);

    // Check if still authenticated after reload
    const urlAfterReload = page.url();
    console.log(`[PUPPETEER_WORKER] URL after reload: ${urlAfterReload}`);
    if (urlAfterReload.includes("/login")) {
      console.error(
        "[PUPPETEER_WORKER] Redirected to login after reload - cookies invalid!"
      );
      return {
        success: false,
        error: "Authentication failed: cookies are invalid or expired",
        revisions: [],
        needsReauth: true,
      };
    }

    console.log(
      "[PUPPETEER_WORKER]  Cookies validated! Now navigating to specific record..."
    );

    // Navigate to the specific record/view
    const navigationUrl = providedViewId
      ? `https://airtable.com/${baseId}/${tableId}/${providedViewId}/${recordId}?blocks=hide`
      : `https://airtable.com/${baseId}/${tableId}/${recordId}`;

    console.log(`[PUPPETEER_WORKER] Target URL: ${navigationUrl}`);
    await page.goto(navigationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await sleep(3000); // Wait for page to fully load

    // Check if we're redirected to login
    const currentUrl = page.url();
    console.log(
      `[PUPPETEER_WORKER] Current URL after navigation: ${currentUrl}`
    );
    if (currentUrl.includes("/login")) {
      console.error(
        "[PUPPETEER_WORKER] Redirected to login page - cookies are invalid or expired!"
      );
      return {
        success: false,
        error: "Authentication failed: cookies are invalid or expired",
        revisions: [],
        needsReauth: true,
      };
    }

    console.log(
      "[PUPPETEER_WORKER]  Successfully authenticated and navigated to record!"
    );

    // Use provided viewId or extract from page
    let viewId = providedViewId;

    if (!viewId) {
      // Extract viewId from the page URL or DOM
      console.log(
        "[PUPPETEER_WORKER] Navigating to table to capture viewId..."
      );

      // Navigate to the specific record to get viewId
      await page.goto(`https://airtable.com/${baseId}/${tableId}/${recordId}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await sleep(3000); // Wait for page to fully load

      // Extract viewId from the current URL or page state
      console.log("[PUPPETEER_WORKER] Attempting to extract viewId...");
      viewId = await page.evaluate(() => {
        // Try multiple methods to get viewId

        // Method 1: Check URL hash for viewId
        // @ts-ignore - window is available in browser context
        const urlHash = window.location.hash;
        const urlMatch = urlHash.match(/\b(viw[a-zA-Z0-9]{14})\b/);
        if (urlMatch) {
          return urlMatch[1];
        }

        // Method 2: Check window.__react__ or global state
        // @ts-ignore - window is available in browser context
        if (window.airtableData?.viewId) {
          // @ts-ignore
          return window.airtableData.viewId;
        }

        // Method 3: Look in script tags for viewId
        // @ts-ignore - document is available in browser context
        const scripts = Array.from(document.querySelectorAll("script"));
        for (const script of scripts) {
          // @ts-ignore - script element has textContent
          const match = script.textContent?.match(
            /["']viewId["']:\s*["'](viw[a-zA-Z0-9]{14})["']/
          );
          if (match) {
            return match[1];
          }
          // Also try without quotes
          // @ts-ignore
          const match2 = script.textContent?.match(
            /viewId:\s*["'](viw[a-zA-Z0-9]{14})["']/
          );
          if (match2) {
            return match2[1];
          }
        }

        // Method 4: Check data attributes
        // @ts-ignore - document is available in browser context
        const viewButton = document.querySelector("[data-view-id]");
        if (viewButton) {
          const viewIdAttr = viewButton.getAttribute("data-view-id");
          if (viewIdAttr && viewIdAttr.startsWith("viw")) {
            return viewIdAttr;
          }
        }

        return null;
      });

      if (viewId) {
        console.log(
          `[PUPPETEER_WORKER] Successfully extracted viewId: ${viewId}`
        );
      } else {
        console.error(
          "[PUPPETEER_WORKER] Could not extract viewId - cannot fetch revision history"
        );
        // Don't close browser here - let the finally block handle it
        return { revisions: [], error: "Could not extract viewId from page" };
      }
    } else {
      console.log(`[PUPPETEER_WORKER] Using provided viewId: ${viewId}`);
    }

    // Now make the API request to fetch revision history
    console.log(`[PUPPETEER_WORKER] Fetching activities via internal API...`);
    console.log(
      `[PUPPETEER_WORKER] Endpoint: /v0.3/view/${viewId}/readRowActivitiesAndComments`
    );

    const revisions = await page.evaluate(
      async (params: any) => {
        // @ts-ignore - recordId used inside evaluate context
        const { rowId, viewId, recordId } = params;

        try {
          // Make the internal API request
          const response = await fetch(
            `https://airtable.com/v0.3/view/${viewId}/readRowActivitiesAndComments`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
              },
              credentials: "include", // Include cookies
              body: JSON.stringify({
                rowId: rowId,
              }),
            }
          );

          console.log(
            "[BROWSER] API Response Status:",
            response.status,
            response.statusText
          );
          console.log(
            "[BROWSER] Response Headers:",
            JSON.stringify(response.headers || {})
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              "[BROWSER] API request failed:",
              response.status,
              response.statusText
            );
            console.error("[BROWSER] Error body:", errorText);
            return {
              error: `API failed with ${response.status}: ${errorText}`,
              revisions: [],
            };
          }

          const data: any = await response.json();
          console.log(
            "[BROWSER] API Response received:",
            data ? Object.keys(data) : "null"
          );
          console.log(
            "[BROWSER] Full response data:",
            JSON.stringify(data).substring(0, 500)
          );

          // Parse the response - Airtable returns activities and comments
          const activities = data.activities || [];
          const comments = data.comments || [];

          console.log(
            "[BROWSER] Found",
            activities.length,
            "activities and",
            comments.length,
            "comments"
          );

          const allChanges: any[] = [];

          // Process activities (field changes) - Focus on Status and Assignee changes
          activities.forEach((activity: any) => {
            try {
              const fieldName = activity.fieldName || "";

              // Filter for Status and Assignee changes only
              const isStatusChange = fieldName.toLowerCase().includes("status");
              const isAssigneeChange = fieldName
                .toLowerCase()
                .includes("assign");

              if (isStatusChange || isAssigneeChange) {
                const change = {
                  // Required format for database
                  uuid: activity.id,
                  issueId: params.recordId, // Will be passed from outer scope
                  columnType: fieldName,
                  oldValue: activity.oldCellValueStr || "",
                  newValue: activity.newCellValueStr || "",
                  createdDate: new Date(activity.createdTime || Date.now()),
                  authoredBy: activity.createdByUserId || "unknown",
                  authorName: activity.createdByUserName || "Unknown User",

                  // Additional metadata
                  type: "activity",
                  fieldType: activity.fieldType || "",
                  text: `${
                    activity.createdByUserName || "User"
                  } changed ${fieldName} from "${
                    activity.oldCellValueStr || ""
                  }" to "${activity.newCellValueStr || ""}"`,
                  rawData: activity,
                };
                allChanges.push(change);
                console.log("[BROWSER] Relevant Activity:", change.text);
              } else {
                console.log(
                  "[BROWSER] Skipping non-relevant field:",
                  fieldName
                );
              }
            } catch (e) {
              console.error("[BROWSER] Error processing activity:", e);
            }
          });

          // Process comments
          comments.forEach((comment: any, index: number) => {
            try {
              const change = {
                index: activities.length + index,
                type: "comment",
                commentId: comment.id,
                timestamp: comment.createdTime || new Date().toISOString(),
                user: comment.createdByUserId || "unknown",
                userName: comment.createdByUserName || "Unknown User",
                text: `${comment.createdByUserName || "User"} commented: ${
                  comment.commentText || ""
                }`,
                commentText: comment.commentText || "",
                rawData: comment,
              };
              allChanges.push(change);
              console.log("[BROWSER] Comment:", change.text);
            } catch (e) {
              console.error("[BROWSER] Error processing comment:", e);
            }
          });

          console.log("[BROWSER] Total changes extracted:", allChanges.length);
          return allChanges;
        } catch (error) {
          console.error("[BROWSER] Error fetching activities:", error);
          return [];
        }
      },
      { baseId, tableId, recordId, rowId, viewId }
    );

    // Handle error response from API
    if (revisions && typeof revisions === "object" && "error" in revisions) {
      console.error(`[PUPPETEER_WORKER] API Error: ${revisions.error}`);
      return {
        success: false,
        error: revisions.error,
        revisions: [],
      };
    }

    const revisionArray = Array.isArray(revisions) ? revisions : [];
    console.log(
      `[PUPPETEER_WORKER] Extracted ${revisionArray.length} revision items via API`
    );

    return {
      success: true,
      revisions: revisionArray,
      recordUrl: `https://airtable.com/${baseId}/${tableId}/${recordId}`,
    };
  } catch (error) {
    console.error("[PUPPETEER_WORKER] Revision history fetch error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    };
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

// Listen for messages from main thread
if (parentPort) {
  parentPort.on("message", async (task: WorkerTask) => {
    console.log("[PUPPETEER_WORKER] Received task:", task.type);
    let result;

    try {
      switch (task.type) {
        case "login":
          result = await handleLogin(task.data);
          break;
        case "scrape":
          result = await handleScrape(task.data);
          break;
        case "scrapeRevisionHistory":
          result = await handleScrapeRevisionHistory(task.data);
          break;
        default:
          result = { success: false, error: "Unknown task type" };
      }

      console.log("[PUPPETEER_WORKER] Task completed:", {
        type: task.type,
        success: result.success,
      });
      parentPort!.postMessage(result);
    } catch (error) {
      console.error("[PUPPETEER_WORKER] Task error:", error);
      parentPort!.postMessage({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  console.log("[PUPPETEER_WORKER] Worker thread initialized and ready");
}
