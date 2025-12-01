import puppeteer, { Browser, Page } from "puppeteer";
import { connectDatabase } from "../config/database";
import { AirtableConnection, Ticket } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";

/**
 * TEST SCRIPT FOR AIRTABLE REVISION HISTORY SCRAPING
 *
 * This script:
 * 1. Fetches cookies from MongoDB AirtableConnection collection
 * 2. Validates cookies before making requests
 * 3. Launches a real Chrome browser instance
 * 4. Gets ticket data (rowId, airtableRecordId) from Tickets collection
 * 5. Scrapes revision history from Airtable website using the API endpoint
 *
 * Test User ID: user_1764525443009
 */

interface RevisionHistoryItem {
  uuid: string;
  recordId: string;
  columnType: string;
  oldValue: any;
  newValue: any;
  createdDate: string;
  userEmail?: string;
  userName?: string;
}

interface TicketData {
  airtableRecordId: string;
  rowId: string;
  baseId: string;
  tableId: string;
  fields: any;
}

class RevisionHistoryScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userId: string;
  private cookies: string = "";

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Step 1: Connect to database and fetch cookies
   */
  async fetchCookiesFromDB(): Promise<boolean> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("📦 STEP 1: FETCHING COOKIES FROM MONGODB");
      console.log("=".repeat(70));

      await connectDatabase();
      console.log("✅ Connected to MongoDB");

      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection) {
        console.error(`❌ No connection found for userId: ${this.userId}`);
        console.log("\n💡 TIP: Make sure you have authenticated first using:");
        console.log("   POST /api/airtable/cookies/auto-retrieve");
        return false;
      }

      console.log("✅ Connection found in database");
      console.log(`   User ID: ${this.userId}`);
      console.log(`   Has Cookies: ${connection.cookies ? "YES" : "NO"}`);
      console.log(
        `   Valid Until: ${
          connection.cookiesValidUntil
            ? new Date(connection.cookiesValidUntil).toISOString()
            : "Not set"
        }`
      );

      if (!connection.cookies) {
        console.error("❌ No cookies found in database");
        console.log("\n💡 TIP: Run the cookie extraction first:");
        console.log("   POST /api/airtable/cookies/auto-retrieve");
        return false;
      }

      // Decrypt cookies if they are encrypted
      let cookieString = connection.cookies;
      if (isEncrypted(cookieString)) {
        console.log("🔓 Decrypting cookies...");
        try {
          cookieString = decrypt(cookieString);
          console.log("✅ Cookies decrypted successfully");
        } catch (error) {
          console.error("❌ Failed to decrypt cookies:", error);
          console.log(
            "💡 TIP: Cookies may be corrupted. Re-authenticate to get fresh cookies."
          );
          return false;
        }
      }

      this.cookies = cookieString;
      console.log(`✅ Cookies retrieved (${this.cookies.length} chars)`);
      return true;
    } catch (error) {
      console.error("❌ Error fetching cookies from DB:", error);
      return false;
    }
  }

  /**
   * Step 2: Validate cookies before proceeding
   */
  async validateCookies(): Promise<boolean> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🔍 STEP 2: VALIDATING COOKIES");
      console.log("=".repeat(70));

      // Parse cookies to check for required ones
      const requiredCookies = [
        "__Host-airtable-session",
        "__Host-airtable-session.sig",
        "brw",
      ];

      const cookieObj: Record<string, string> = {};
      const cookiePairs = this.cookies.split(";");

      for (const pair of cookiePairs) {
        const [key, value] = pair.trim().split("=");
        if (key && value) {
          cookieObj[key] = value;
        }
      }

      console.log(`📊 Total cookies found: ${Object.keys(cookieObj).length}`);

      let allRequiredPresent = true;
      for (const required of requiredCookies) {
        const present = cookieObj[required] !== undefined;
        console.log(
          `   ${present ? "✅" : "❌"} ${required}: ${
            present ? "Present" : "MISSING"
          }`
        );
        if (!present) allRequiredPresent = false;
      }

      if (!allRequiredPresent) {
        console.error("\n❌ Required cookies are missing!");
        console.log("💡 TIP: Re-authenticate to get fresh cookies");
        return false;
      }

      console.log("\n✅ All required cookies are present");
      return true;
    } catch (error) {
      console.error("❌ Error validating cookies:", error);
      return false;
    }
  }

  /**
   * Step 3: Launch Chrome browser with proper configuration
   */
  async launchBrowser(): Promise<boolean> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🌐 STEP 3: LAUNCHING CHROME BROWSER");
      console.log("=".repeat(70));

      console.log("🔧 Browser Configuration:");
      console.log("   - OS: Ubuntu");
      console.log("   - Browser: Real Chrome (not Chromium)");
      console.log("   - Headless: No (for debugging)");
      console.log("   - DevTools: Auto-open for inspection");

      this.browser = await puppeteer.launch({
        headless: false, // Real browser window for debugging
        executablePath: "/usr/bin/google-chrome", // Real Chrome on Ubuntu
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1920,1080",
          "--disable-web-security", // Disable CORS
          "--disable-features=IsolateOrigins,site-per-process", // Allow cross-origin access
          "--allow-running-insecure-content", // Allow mixed content
          "--disable-blink-features=AutomationControlled", // Hide automation
          "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        ],
        devtools: true, // Open DevTools automatically
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
        ignoreDefaultArgs: ["--enable-automation"], // Don't show "Chrome is being controlled" banner
      });

      console.log("✅ Browser launched successfully");

      this.page = await this.browser.newPage();
      console.log("✅ New page created");

      // Enable request interception to bypass CORS
      await this.page.setRequestInterception(true);

      this.page.on("request", (request) => {
        // Allow all requests to proceed
        request.continue();
      });

      // Intercept responses to add CORS headers
      this.page.on("response", async (response) => {
        // Log API calls for debugging
        const url = response.url();
        if (
          url.includes("/v0.3/") ||
          url.includes("readRowActivitiesAndComments")
        ) {
          console.log(`   📡 API Call: ${url.substring(0, 100)}...`);
          console.log(`      Status: ${response.status()}`);
        }
      });

      // Override navigator.webdriver to hide automation
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });

        // Add chrome object to make it look like real Chrome
        (window as any).chrome = {
          runtime: {},
        };

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === "notifications"
            ? Promise.resolve({ state: "denied" } as PermissionStatus)
            : originalQuery(parameters);
      });

      // Set extra headers to match real browser
      await this.page.setExtraHTTPHeaders({
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br, zstd",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua":
          '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      });

      console.log("✅ Headers configured");
      console.log("✅ CORS bypass enabled");

      // Set cookies - parse and validate each cookie
      const cookieObjects = this.cookies
        .split(";")
        .map((cookie) => {
          const [name, ...valueParts] = cookie.trim().split("=");
          const value = valueParts.join("="); // Handle values with = in them

          if (!name || !value) {
            return null;
          }

          // Handle __Host- prefix cookies (require exact domain match, no subdomain)
          const isHostPrefixed = name.trim().startsWith("__Host-");

          return {
            name: name.trim(),
            value: value.trim(),
            domain: isHostPrefixed ? "airtable.com" : ".airtable.com", // No dot for __Host- cookies
            path: "/",
            httpOnly: false,
            secure: true,
            sameSite: "Lax" as const,
          };
        })
        .filter(
          (cookie): cookie is NonNullable<typeof cookie> => cookie !== null
        );

      console.log(
        `📦 Prepared ${cookieObjects.length} valid cookies for browser`
      );

      // Set cookies one by one to catch errors
      let successCount = 0;
      const failedCookies: string[] = [];
      for (const cookie of cookieObjects) {
        try {
          await this.page.setCookie(cookie);
          successCount++;
        } catch (error) {
          failedCookies.push(cookie.name);
          console.warn(`⚠️  Skipped invalid cookie: ${cookie.name}`);
        }
      }

      console.log(
        `✅ ${successCount}/${cookieObjects.length} cookies set in browser`
      );

      if (failedCookies.length > 0) {
        console.log(`⚠️  Failed cookies: ${failedCookies.join(", ")}`);
      }

      return true;
    } catch (error) {
      console.error("❌ Error launching browser:", error);
      if (error instanceof Error) {
        if (error.message.includes("google-chrome")) {
          console.log("\n⚠️  CHROME NOT FOUND!");
          console.log("Please install Google Chrome:");
          console.log(
            "   1. Download: wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
          );
          console.log(
            "   2. Install: sudo dpkg -i google-chrome-stable_current_amd64.deb"
          );
          console.log("   3. Fix dependencies: sudo apt-get install -f");
          console.log(
            "\nOr update the executablePath in the script to point to your Chrome installation"
          );
        }
      }
      return false;
    }
  }

  /**
   * Step 4: Get ticket data from MongoDB
   */
  async getTicketData(): Promise<TicketData | null> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🎫 STEP 4: FETCHING TICKET DATA FROM MONGODB");
      console.log("=".repeat(70));

      // Use specific record ID that has revision history
      const targetRecordId = "recuMKeu0aLm7i0hP";
      console.log(`🎯 Looking for specific record: ${targetRecordId}`);

      const ticket = await Ticket.findOne({
        userId: this.userId,
        airtableRecordId: targetRecordId,
      });

      if (!ticket) {
        console.warn(`⚠️  Target record ${targetRecordId} not found`);
        console.log("   Falling back to first available ticket...");

        const fallbackTicket = await Ticket.findOne({ userId: this.userId });

        if (!fallbackTicket) {
          console.error(`❌ No tickets found for userId: ${this.userId}`);
          console.log("\n💡 TIP: Sync data first using:");
          console.log("   POST /api/airtable/data/sync-fresh");
          return null;
        }

        console.log("✅ Using fallback ticket:");
        console.log(`   Record ID: ${fallbackTicket.airtableRecordId}`);
        console.log(`   Row ID: ${fallbackTicket.rowId}`);
        console.log(`   Base ID: ${fallbackTicket.baseId}`);
        console.log(`   Table ID: ${fallbackTicket.tableId}`);

        return {
          airtableRecordId: fallbackTicket.airtableRecordId,
          rowId: fallbackTicket.rowId,
          baseId: fallbackTicket.baseId,
          tableId: fallbackTicket.tableId,
          fields: fallbackTicket.fields,
        };
      }

      console.log("✅ Target ticket found:");
      console.log(`   Record ID: ${ticket.airtableRecordId}`);
      console.log(`   Row ID: ${ticket.rowId}`);
      console.log(`   Base ID: ${ticket.baseId}`);
      console.log(`   Table ID: ${ticket.tableId}`);
      console.log(
        `   Fields: ${JSON.stringify(ticket.fields).substring(0, 100)}...`
      );

      return {
        airtableRecordId: ticket.airtableRecordId,
        rowId: ticket.rowId,
        baseId: ticket.baseId,
        tableId: ticket.tableId,
        fields: ticket.fields,
      };
    } catch (error) {
      console.error("❌ Error fetching ticket data:", error);
      return null;
    }
  }

  /**
   * Step 5: Scrape revision history using the Airtable API endpoint
   */
  async scrapeRevisionHistory(
    ticketData: TicketData
  ): Promise<RevisionHistoryItem[]> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🔄 STEP 5: SCRAPING REVISION HISTORY");
      console.log("=".repeat(70));

      if (!this.page) {
        throw new Error("Browser page not initialized");
      }

      // Navigate to record page to access revision history UI
      const recordUrl = `https://airtable.com/${ticketData.baseId}/${ticketData.tableId}/viwfbZDPk6u7uvwdH/${ticketData.airtableRecordId}?blocks=show`;
      console.log(`\n🌐 Navigating to record page...`);
      console.log(`   URL: ${recordUrl}`);

      // Navigate with longer timeout and wait for network to settle
      await this.page.goto(recordUrl, {
        waitUntil: "networkidle0", // Wait for all network activity to stop
        timeout: 60000, // 60 second timeout
      });
      console.log("✅ Page loaded");

      // Wait for Airtable app to fully initialize
      console.log("\n⏳ Waiting for Airtable app to load...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check if page loaded successfully by looking for Airtable elements
      const pageLoaded = await this.page.evaluate(() => {
        // Check for common Airtable UI elements
        const hasAirtableApp =
          document.querySelector('[class*="airtable"]') !== null;
        const hasRecord =
          document.querySelector("[data-tutorial-selector-id]") !== null;
        return (
          hasAirtableApp ||
          hasRecord ||
          document.body.innerText.includes("Batch")
        );
      });

      if (pageLoaded) {
        console.log("✅ Airtable app loaded successfully");
      } else {
        console.warn("⚠️  Page may not have loaded completely");
      }

      // Try to click on Activity/History tab if it exists
      console.log("\n🔍 Looking for Activity/History section...");
      try {
        // Look for common selectors for activity/history tabs
        const historySelectors = [
          'button[aria-label*="Activity"]',
          'button[aria-label*="History"]',
          'div[data-tutorial-selector-id*="activity"]',
          'div[data-tutorial-selector-id*="history"]',
          'span:has-text("Activity")',
          'span:has-text("History")',
          '[role="tab"]:has-text("Activity")',
          '[role="tab"]:has-text("History")',
        ];

        let clicked = false;
        for (const selector of historySelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              await element.click();
              console.log(`✅ Clicked on activity/history tab: ${selector}`);
              clicked = true;
              await new Promise((resolve) => setTimeout(resolve, 2000));
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!clicked) {
          console.log("⚠️  Could not find activity tab - will use API method");
        }
      } catch (error) {
        console.log("⚠️  Activity tab not found - proceeding with API method");
      }

      // Build the API URL
      const recordId = ticketData.airtableRecordId;
      const stringifiedObjectParams = JSON.stringify({
        limit: 100,
        offsetV2: null,
        shouldReturnDeserializedActivityItems: true,
        shouldIncludeRowActivityOrCommentUserObjById: true,
      });

      const requestId = `req${this.generateRandomString(16)}`;
      const secretSocketId = `soc${this.generateRandomString(16)}`;

      const apiUrl = `https://airtable.com/v0.3/row/${recordId}/readRowActivitiesAndComments`;
      const params = new URLSearchParams({
        stringifiedObjectParams,
        requestId,
        secretSocketId,
      });

      const fullUrl = `${apiUrl}?${params.toString()}`;

      console.log("\n🌐 Making API Request:");
      console.log(`   Endpoint: ${apiUrl}`);
      console.log(`   Record ID: ${recordId}`);

      // Make the API request using page.evaluate
      const response = await this.page.evaluate(
        async (url, baseId) => {
          try {
            const res = await fetch(url, {
              method: "GET",
              headers: {
                accept: "application/json, text/javascript, */*; q=0.01",
                "x-airtable-application-id": baseId,
                "x-airtable-inter-service-client": "webClient",
                "x-time-zone": "Asia/Calcutta",
                "x-requested-with": "XMLHttpRequest",
              },
              credentials: "include",
            });

            const data = await res.json();
            return {
              ok: res.ok,
              status: res.status,
              statusText: res.statusText,
              data: data,
            };
          } catch (error: any) {
            return {
              ok: false,
              status: 0,
              statusText: "Network Error",
              error: error.message,
            };
          }
        },
        fullUrl,
        ticketData.baseId
      );

      console.log(`\n📡 API Response:`);
      console.log(`   Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        console.error("❌ API request failed!");
        console.error(
          `   Error: ${JSON.stringify(
            response.data || response.error,
            null,
            2
          )}`
        );

        if (response.status === 401) {
          console.log("\n⚠️  AUTHENTICATION FAILED!");
          console.log(
            "   Your cookies may have expired. Please re-authenticate."
          );
        }

        return [];
      }

      console.log("✅ API request successful!");

      // Parse the revision history from response
      const revisionHistory = this.parseRevisionHistory(
        response.data,
        recordId
      );

      console.log(`\n📊 SCRAPING RESULTS:`);
      console.log(`   Total revisions found: ${revisionHistory.length}`);

      return revisionHistory;
    } catch (error) {
      console.error("❌ Error scraping revision history:", error);
      return [];
    }
  }

  /**
   * Parse the API response into our revision history format
   */
  private parseRevisionHistory(
    apiResponse: any,
    recordId: string
  ): RevisionHistoryItem[] {
    const revisions: RevisionHistoryItem[] = [];

    try {
      if (!apiResponse || !apiResponse.data) {
        console.log("⚠️  No data in API response");
        return revisions;
      }

      const activities = apiResponse.data.rowActivitiesAndComments || [];
      const userMap = apiResponse.data.rowActivityOrCommentUserObjById || {};

      console.log(`\n🔍 Parsing response data...`);
      console.log(`   Activities found: ${activities.length}`);
      console.log(`   Users found: ${Object.keys(userMap).length}`);

      for (const activity of activities) {
        if (activity.type === "row_activity") {
          const userId = activity.createdByUserId;
          const user = userMap[userId];

          // Handle field changes
          if (activity.fieldChanges) {
            const fieldIds = Object.keys(activity.fieldChanges);
            console.log(`\n   📝 Activity ID: ${activity.id}`);
            console.log(`      Created: ${activity.createdTime}`);
            console.log(
              `      User: ${user?.name || user?.email || "Unknown"}`
            );
            console.log(`      Fields changed: ${fieldIds.length}`);

            for (const fieldId in activity.fieldChanges) {
              const change = activity.fieldChanges[fieldId];

              const revision: RevisionHistoryItem = {
                uuid: activity.id || `act_${Date.now()}_${Math.random()}`,
                recordId: activity.rowId || recordId,
                columnType: change.fieldName || fieldId,
                oldValue: change.previousCellValuesByFieldId?.[fieldId] || null,
                newValue: change.currentCellValuesByFieldId?.[fieldId] || null,
                createdDate: new Date(activity.createdTime).toISOString(),
                userEmail: user?.email || "Unknown",
                userName: user?.name || user?.email || "Unknown",
              };

              revisions.push(revision);

              // Print each change detail
              console.log(`      • ${change.fieldName || fieldId}:`);
              console.log(`        Old: ${JSON.stringify(revision.oldValue)}`);
              console.log(`        New: ${JSON.stringify(revision.newValue)}`);
            }
          }
        } else if (activity.type === "row_comment") {
          // Also capture comments as revision items
          const userId = activity.createdByUserId;
          const user = userMap[userId];

          console.log(`\n   💬 Comment ID: ${activity.id}`);
          console.log(`      Created: ${activity.createdTime}`);
          console.log(`      User: ${user?.name || user?.email || "Unknown"}`);
          console.log(
            `      Comment: ${activity.commentText?.substring(0, 100) || "N/A"}`
          );
        }
      }

      console.log(
        `\n✅ Parsed ${revisions.length} revision items from ${activities.length} activities`
      );
    } catch (error) {
      console.error("❌ Error parsing revision history:", error);
    }

    return revisions;
  }

  /**
   * Generate random string for request IDs
   */
  private generateRandomString(length: number): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Cleanup: Close browser
   */
  async cleanup(): Promise<void> {
    console.log("\n" + "=".repeat(70));
    console.log("🧹 CLEANUP");
    console.log("=".repeat(70));

    if (this.browser) {
      await this.browser.close();
      console.log("✅ Browser closed");
    }
  }

  /**
   * Main execution flow
   */
  async run(): Promise<void> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🚀 AIRTABLE REVISION HISTORY SCRAPING TEST");
      console.log("=".repeat(70));
      console.log(`📋 Test User ID: ${this.userId}`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);

      // Step 1: Fetch cookies from MongoDB
      const cookiesFetched = await this.fetchCookiesFromDB();
      if (!cookiesFetched) {
        console.log("\n❌ TEST FAILED: Could not fetch cookies");
        return;
      }

      // Step 2: Validate cookies
      const cookiesValid = await this.validateCookies();
      if (!cookiesValid) {
        console.log("\n❌ TEST FAILED: Cookies validation failed");
        return;
      }

      // Step 3: Launch browser
      const browserLaunched = await this.launchBrowser();
      if (!browserLaunched) {
        console.log("\n❌ TEST FAILED: Could not launch browser");
        return;
      }

      // Step 4: Get ticket data
      const ticketData = await this.getTicketData();
      if (!ticketData) {
        console.log("\n❌ TEST FAILED: Could not fetch ticket data");
        await this.cleanup();
        return;
      }

      // Step 5: Scrape revision history
      const revisions = await this.scrapeRevisionHistory(ticketData);

      // Final results
      console.log("\n" + "=".repeat(70));
      console.log("🎉 TEST COMPLETED");
      console.log("=".repeat(70));
      console.log(`✅ Total revisions scraped: ${revisions.length}`);
      console.log(`⏰ Completed at: ${new Date().toISOString()}`);

      if (revisions.length > 0) {
        console.log("\n" + "=".repeat(70));
        console.log("📄 FULL REVISION HISTORY DATA");
        console.log("=".repeat(70));

        revisions.forEach((revision, index) => {
          console.log(`\n[${index + 1}/${revisions.length}] Revision:`);
          console.log(`   UUID: ${revision.uuid}`);
          console.log(`   Record ID: ${revision.recordId}`);
          console.log(`   Field: ${revision.columnType}`);
          console.log(
            `   Changed by: ${revision.userName} (${revision.userEmail})`
          );
          console.log(`   Date: ${revision.createdDate}`);
          console.log(
            `   Old Value: ${JSON.stringify(revision.oldValue, null, 2)}`
          );
          console.log(
            `   New Value: ${JSON.stringify(revision.newValue, null, 2)}`
          );
        });

        console.log("\n" + "=".repeat(70));
        console.log("📋 REVISION HISTORY JSON");
        console.log("=".repeat(70));
        console.log(JSON.stringify(revisions, null, 2));
      } else {
        console.log("\n⚠️  No revision history found for this record.");
        console.log("   This record may not have any field changes yet.");
        console.log(
          "   Try editing a field in Airtable and run the script again."
        );
      }

      // Keep browser open for inspection
      console.log("\n" + "=".repeat(70));
      console.log("⏸️  Browser kept open for manual inspection.");
      console.log("   Press Ctrl+C to close and exit.");
      console.log("=".repeat(70));

      // Wait indefinitely (user can manually close)
      await new Promise(() => {});
    } catch (error) {
      console.error("\n💥 UNEXPECTED ERROR:", error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const TEST_USER_ID = "user_1764525443009";
  const scraper = new RevisionHistoryScraper(TEST_USER_ID);

  // Handle Ctrl+C gracefully
  process.on("SIGINT", async () => {
    console.log("\n\n⏹️  Interrupted by user");
    await scraper.cleanup();
    process.exit(0);
  });

  await scraper.run();
}

// Run the test
main().catch(console.error);
