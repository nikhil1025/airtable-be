import puppeteer, { Browser, Page } from "puppeteer";
import { connectDatabase } from "../config/database";
import { AirtableConnection, Ticket } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";
import * as cheerio from "cheerio";

/**
 * BULK REVISION HISTORY SCRAPING SCRIPT
 *
 * This script:
 * 1. Fetches all tickets from MongoDB Tickets collection
 * 2. Retrieves cookies from AirtableConnection collection
 * 3. Validates cookies before making requests
 * 4. Launches a real Chrome browser instance with CORS bypass
 * 5. For each ticket, scrapes revision history from Airtable
 * 6. Handles errors gracefully and reports them
 * 7. Returns null for records with no revision history
 *
 * Output Format: recordId - [...data] | null
 */

interface RevisionHistoryItem {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: any;
  newValue: any;
  createdDate: Date;
  authoredBy: string;
}

interface TicketData {
  airtableRecordId: string;
  rowId: string;
  baseId: string;
  tableId: string;
  fields: any;
}

interface ProcessingResult {
  recordId: string;
  status: "success" | "error" | "no_data";
  revisions: RevisionHistoryItem[] | null;
  error?: string;
}

class BulkRevisionHistoryScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userId: string;
  private cookies: string = "";
  private results: ProcessingResult[] = [];

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Step 1: Fetch cookies from MongoDB
   */
  async fetchCookiesFromDB(): Promise<boolean> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("📦 STEP 1: FETCHING COOKIES FROM MONGODB");
      console.log("=".repeat(70));

      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection || !connection.cookies) {
        console.error(`❌ No cookies found for userId: ${this.userId}`);
        return false;
      }

      let cookieString = connection.cookies;
      if (isEncrypted(cookieString)) {
        console.log("🔓 Decrypting cookies...");
        try {
          cookieString = decrypt(cookieString);
          console.log("✅ Cookies decrypted successfully");
        } catch (error) {
          console.error("❌ Failed to decrypt cookies:", error);
          return false;
        }
      }

      this.cookies = cookieString;
      console.log(`✅ Cookies retrieved (${cookieString.length} chars)`);
      console.log(
        `   Valid Until: ${
          connection.cookiesValidUntil
            ? new Date(connection.cookiesValidUntil).toISOString()
            : "Not set"
        }`
      );

      return true;
    } catch (error) {
      console.error("❌ Error fetching cookies:", error);
      return false;
    }
  }

  /**
   * Step 2: Validate cookies
   */
  validateCookies(): boolean {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🔍 STEP 2: VALIDATING COOKIES");
      console.log("=".repeat(70));

      const cookieArray = this.cookies.split(";").map((c) => c.trim());
      console.log(`📊 Total cookies found: ${cookieArray.length}`);

      const requiredCookies = [
        "__Host-airtable-session",
        "__Host-airtable-session.sig",
        "brw",
      ];

      for (const required of requiredCookies) {
        const found = cookieArray.some((c) => c.startsWith(required));
        if (found) {
          console.log(`   ✅ ${required}: Present`);
        } else {
          console.log(`   ❌ ${required}: Missing`);
          return false;
        }
      }

      console.log("\n✅ All required cookies are present");
      return true;
    } catch (error) {
      console.error("❌ Error validating cookies:", error);
      return false;
    }
  }

  /**
   * Step 3: Launch browser
   */
  async launchBrowser(): Promise<boolean> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🌐 STEP 3: LAUNCHING CHROME BROWSER");
      console.log("=".repeat(70));

      this.browser = await puppeteer.launch({
        headless: true, // Run in background for bulk processing
        executablePath: "/usr/bin/google-chrome",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1920,1080",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--allow-running-insecure-content",
          "--disable-blink-features=AutomationControlled",
          "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        ],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
        ignoreDefaultArgs: ["--enable-automation"],
      });

      console.log("✅ Browser launched successfully");

      this.page = await this.browser.newPage();
      console.log("✅ New page created");

      // Enable request interception
      await this.page.setRequestInterception(true);
      this.page.on("request", (request) => {
        request.continue();
      });

      // Override navigator.webdriver
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });
        (window as any).chrome = { runtime: {} };
      });

      // Set headers
      await this.page.setExtraHTTPHeaders({
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br, zstd",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua":
          '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
      });

      console.log("✅ Headers configured");
      console.log("✅ CORS bypass enabled");

      // Set cookies
      const cookieObjects = this.cookies
        .split(";")
        .map((cookie) => {
          const [name, ...valueParts] = cookie.trim().split("=");
          const value = valueParts.join("=");

          if (!name || !value) return null;

          const isHostPrefixed = name.trim().startsWith("__Host-");

          return {
            name: name.trim(),
            value: value.trim(),
            domain: isHostPrefixed ? "airtable.com" : ".airtable.com",
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "None" as const,
          };
        })
        .filter((c) => c !== null);

      let successCount = 0;
      for (const cookie of cookieObjects) {
        try {
          await this.page.setCookie(cookie as any);
          successCount++;
        } catch (error) {
          console.warn(`⚠️  Failed to set cookie: ${cookie!.name}`);
        }
      }

      console.log(`✅ ${successCount}/${cookieObjects.length} cookies set`);
      return true;
    } catch (error) {
      console.error("❌ Error launching browser:", error);
      return false;
    }
  }

  /**
   * Step 4: Fetch all tickets from MongoDB
   */
  async fetchAllTickets(): Promise<TicketData[]> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🎫 STEP 4: FETCHING ALL TICKETS FROM MONGODB");
      console.log("=".repeat(70));

      const tickets = await Ticket.find({ userId: this.userId }).select(
        "airtableRecordId rowId baseId tableId fields"
      );

      console.log(`✅ Found ${tickets.length} tickets for user ${this.userId}`);

      if (tickets.length === 0) {
        console.warn("⚠️  No tickets found. Sync data first.");
        return [];
      }

      return tickets.map((ticket) => ({
        airtableRecordId: ticket.airtableRecordId,
        rowId: ticket.rowId,
        baseId: ticket.baseId,
        tableId: ticket.tableId,
        fields: ticket.fields,
      }));
    } catch (error) {
      console.error("❌ Error fetching tickets:", error);
      return [];
    }
  }

  /**
   * Parse HTML from diffRowHtml
   */
  private parseHTMLDiff(html: string): Array<{
    columnType: string;
    columnId: string;
    oldValue: string | null;
    newValue: string | null;
  }> {
    const changes: Array<{
      columnType: string;
      columnId: string;
      oldValue: string | null;
      newValue: string | null;
    }> = [];

    try {
      const $ = cheerio.load(html);

      $(".historicalCellContainer").each((_index, container) => {
        const $container = $(container);
        const columnHeader = $container.find(".micro.strong.caps");
        const columnType = columnHeader.text().trim();
        const columnId =
          columnHeader.attr("columnid") ||
          columnHeader.attr("columnId") ||
          "";

        if (!columnType) return;

        const isNullToValue = $container.find(".nullToValue").length > 0;
        const isDiff = $container.find(".diff").length > 0;

        let oldValue: string | null = null;
        let newValue: string | null = null;

        if (isNullToValue) {
          oldValue = null;
          const successElement = $container.find(".colors-background-success");
          newValue = successElement.text().trim();

          const textDiff = $container.find(".textDiff");
          if (textDiff.length > 0) {
            const addedText = textDiff
              .find(".colors-background-success")
              .text()
              .trim();
            if (addedText) newValue = addedText;
          }
        } else if (isDiff) {
          const negativeElement = $container.find(
            ".colors-background-negative, .strikethrough.colors-foreground-accent-negative"
          );
          const successElement = $container.find(".colors-background-success");

          oldValue = negativeElement.first().text().trim();
          newValue = successElement.last().text().trim();

          const textDiff = $container.find(".textDiff");
          if (textDiff.length > 0) {
            const removedText = textDiff
              .find(".colors-background-negative")
              .text()
              .trim();
            const addedText = textDiff
              .find(".colors-background-success")
              .text()
              .trim();
            if (removedText) oldValue = removedText;
            if (addedText) newValue = addedText;
          }
        }

        if (oldValue !== null || newValue !== null) {
          changes.push({
            columnType,
            columnId,
            oldValue,
            newValue,
          });
        }
      });
    } catch (error) {
      console.error("❌ Error parsing HTML diff:", error);
    }

    return changes;
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
   * Step 5: Scrape revision history for a single ticket
   */
  async scrapeRevisionHistoryForTicket(
    ticketData: TicketData
  ): Promise<RevisionHistoryItem[] | null> {
    try {
      if (!this.page) {
        throw new Error("Browser page not initialized");
      }

      const recordId = ticketData.airtableRecordId;

      // Build API URL
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

      // Navigate to record page first (for referer and cookies)
      const recordUrl = `https://airtable.com/${ticketData.baseId}/${ticketData.tableId}/viwfbZDPk6u7uvwdH/${recordId}?blocks=show`;
      
      try {
        await this.page.goto(recordUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });
      } catch (navError) {
        console.warn(`   ⚠️  Navigation timeout for ${recordId}, continuing...`);
      }

      // Wait a bit for page to settle
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Make API request
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

      if (!response.ok) {
        console.error(
          `   ❌ API request failed (Status ${response.status}): ${response.statusText}`
        );
        return null;
      }

      // Parse revision history
      const revisions: RevisionHistoryItem[] = [];

      if (!response.data || !response.data.data) {
        return null;
      }

      const activityInfoById = response.data.data.rowActivityInfoById || {};
      const activityIds = Object.keys(activityInfoById);

      if (activityIds.length === 0) {
        return null; // No revision history
      }

      // Parse each activity
      for (const activityId of activityIds) {
        const activity = activityInfoById[activityId];
        const userId = activity.originatingUserId;

        if (activity.diffRowHtml) {
          const changes = this.parseHTMLDiff(activity.diffRowHtml);

          for (const change of changes) {
            revisions.push({
              uuid: activityId,
              issueId: recordId,
              columnType: change.columnType,
              oldValue: change.oldValue,
              newValue: change.newValue,
              createdDate: new Date(activity.createdTime),
              authoredBy: userId,
            });
          }
        }
      }

      return revisions.length > 0 ? revisions : null;
    } catch (error) {
      console.error(`   ❌ Error scraping record:`, error);
      throw error;
    }
  }

  /**
   * Step 6: Process all tickets
   */
  async processAllTickets(tickets: TicketData[]): Promise<void> {
    console.log("\n" + "=".repeat(70));
    console.log("🔄 STEP 5: PROCESSING ALL TICKETS");
    console.log("=".repeat(70));
    console.log(`📋 Total tickets to process: ${tickets.length}\n`);

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const recordId = ticket.airtableRecordId;

      console.log(
        `\n[${i + 1}/${tickets.length}] Processing: ${recordId}`
      );

      try {
        const revisions = await this.scrapeRevisionHistoryForTicket(ticket);

        if (revisions === null) {
          console.log(`   ⚠️  No revision history found`);
          this.results.push({
            recordId,
            status: "no_data",
            revisions: null,
          });
        } else {
          console.log(`   ✅ Found ${revisions.length} revision items`);
          this.results.push({
            recordId,
            status: "success",
            revisions,
          });
        }
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        this.results.push({
          recordId,
          status: "error",
          revisions: null,
          error: error.message,
        });
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Display final results
   */
  displayResults(): void {
    console.log("\n" + "=".repeat(70));
    console.log("📊 PROCESSING RESULTS");
    console.log("=".repeat(70));

    const successCount = this.results.filter(
      (r) => r.status === "success"
    ).length;
    const noDataCount = this.results.filter(
      (r) => r.status === "no_data"
    ).length;
    const errorCount = this.results.filter((r) => r.status === "error").length;

    console.log(`\n✅ Success: ${successCount}`);
    console.log(`⚠️  No Data: ${noDataCount}`);
    console.log(`❌ Errors: ${errorCount}`);

    console.log("\n" + "=".repeat(70));
    console.log("📄 DETAILED RESULTS");
    console.log("=".repeat(70));

    for (const result of this.results) {
      if (result.status === "success" && result.revisions) {
        console.log(`\n${result.recordId} - [${result.revisions.length} items]`);
        console.log(JSON.stringify(result.revisions, null, 2));
      } else if (result.status === "no_data") {
        console.log(`\n${result.recordId} - null`);
      } else if (result.status === "error") {
        console.log(`\n${result.recordId} - ERROR: ${result.error}`);
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("📋 SUMMARY JSON");
    console.log("=".repeat(70));
    console.log(JSON.stringify(this.results, null, 2));
  }

  /**
   * Cleanup
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
   * Main execution
   */
  async run(): Promise<void> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🚀 BULK AIRTABLE REVISION HISTORY SCRAPER");
      console.log("=".repeat(70));
      console.log(`📋 User ID: ${this.userId}`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);

      // Connect to database
      await connectDatabase();
      console.log("✅ Connected to MongoDB");

      // Step 1: Fetch cookies
      const cookiesFetched = await this.fetchCookiesFromDB();
      if (!cookiesFetched) {
        console.log("\n❌ FAILED: Could not fetch cookies");
        return;
      }

      // Step 2: Validate cookies
      const cookiesValid = this.validateCookies();
      if (!cookiesValid) {
        console.log("\n❌ FAILED: Cookies validation failed");
        return;
      }

      // Step 3: Launch browser
      const browserLaunched = await this.launchBrowser();
      if (!browserLaunched) {
        console.log("\n❌ FAILED: Could not launch browser");
        return;
      }

      // Step 4: Fetch all tickets
      const tickets = await this.fetchAllTickets();
      if (tickets.length === 0) {
        console.log("\n❌ FAILED: No tickets found");
        await this.cleanup();
        return;
      }

      // Step 5: Process all tickets
      await this.processAllTickets(tickets);

      // Display results
      this.displayResults();

      console.log("\n" + "=".repeat(70));
      console.log("🎉 BULK PROCESSING COMPLETED");
      console.log("=".repeat(70));
      console.log(`⏰ Completed at: ${new Date().toISOString()}`);

      // Cleanup
      await this.cleanup();
    } catch (error) {
      console.error("\n💥 UNEXPECTED ERROR:", error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const TEST_USER_ID = process.argv[2] || "user_1764525443009";

  console.log(`\n📋 Running bulk revision history scraper for user: ${TEST_USER_ID}`);

  const scraper = new BulkRevisionHistoryScraper(TEST_USER_ID);

  // Handle Ctrl+C gracefully
  process.on("SIGINT", async () => {
    console.log("\n\n⏹️  Interrupted by user");
    await scraper.cleanup();
    process.exit(0);
  });

  await scraper.run();
  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
