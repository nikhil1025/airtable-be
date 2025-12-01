import * as cheerio from "cheerio";
import puppeteer, { Browser, Page } from "puppeteer";
import { AirtableConnection, RevisionHistory, Ticket } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";

/**
 * REVISION HISTORY FETCH SERVICE
 *
 * This service fetches revision histories for all tickets of a user,
 * stores them in MongoDB RevisionHistory collection, and returns the results.
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

export class RevisionHistoryFetchService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userId: string;
  private cookies: string = "";

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Fetch cookies from MongoDB
   */
  private async fetchCookiesFromDB(): Promise<boolean> {
    try {
      console.log(
        `\n[RevisionHistoryFetchService] 📦 Step 1: Fetching cookies for user: ${this.userId}`
      );

      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection || !connection.cookies) {
        console.error(
          `[RevisionHistoryFetchService] ❌ No cookies found for userId: ${this.userId}`
        );
        return false;
      }
      console.log(
        `[RevisionHistoryFetchService] ✅ Found AirtableConnection document`
      );
      console.log(
        `[RevisionHistoryFetchService] 📊 Cookie length: ${
          connection.cookies?.length || 0
        } chars`
      );

      let cookieString = connection.cookies;
      if (isEncrypted(cookieString)) {
        console.log(
          "[RevisionHistoryFetchService] 🔐 Cookies are encrypted, decrypting..."
        );
        try {
          cookieString = decrypt(cookieString);
          console.log(
            "[RevisionHistoryFetchService] ✅ Cookies decrypted successfully"
          );
        } catch (error) {
          console.error(
            "[RevisionHistoryFetchService] ❌ Failed to decrypt cookies:",
            error
          );
          return false;
        }
      } else {
        console.log(
          "[RevisionHistoryFetchService] 🔓 Cookies are not encrypted"
        );
      }

      this.cookies = cookieString;
      console.log(
        `[RevisionHistoryFetchService] ✅ Cookies retrieved (${cookieString.length} chars)`
      );
      console.log(
        `[RevisionHistoryFetchService] 📅 Cookies valid until: ${
          connection.cookiesValidUntil
            ? new Date(connection.cookiesValidUntil).toISOString()
            : "Not set"
        }`
      );

      return true;
    } catch (error) {
      console.error(
        "[RevisionHistoryFetchService] Error fetching cookies:",
        error
      );
      return false;
    }
  }

  /**
   * Launch browser
   */
  private async launchBrowser(): Promise<boolean> {
    try {
      console.log(
        "\n[RevisionHistoryFetchService] 🌐 Step 2: Launching Chrome browser..."
      );
      console.log(
        "[RevisionHistoryFetchService] 🔧 Browser config: headless=true, executablePath=/usr/bin/google-chrome"
      );

      this.browser = await puppeteer.launch({
        headless: true,
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

      console.log(
        "[RevisionHistoryFetchService] ✅ Browser launched successfully"
      );

      this.page = await this.browser.newPage();
      console.log("[RevisionHistoryFetchService] ✅ New page created");

      // Enable request interception
      console.log(
        "[RevisionHistoryFetchService] 🔧 Setting up request interception..."
      );
      await this.page.setRequestInterception(true);
      this.page.on("request", (request) => {
        request.continue();
      });

      // Override navigator.webdriver
      console.log(
        "[RevisionHistoryFetchService] 🤖 Overriding navigator.webdriver..."
      );
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });
        (window as any).chrome = { runtime: {} };
      });

      // Set headers
      console.log("[RevisionHistoryFetchService] 📋 Setting HTTP headers...");
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

      console.log(
        `[RevisionHistoryFetchService] 🍪 Setting ${cookieObjects.length} cookies...`
      );
      let successCount = 0;
      for (const cookie of cookieObjects) {
        try {
          await this.page.setCookie(cookie as any);
          successCount++;
        } catch (error) {
          console.warn(
            `[RevisionHistoryFetchService] ⚠️  Failed to set cookie: ${
              cookie!.name
            }`
          );
        }
      }

      console.log(
        `[RevisionHistoryFetchService] ✅ ${successCount}/${cookieObjects.length} cookies set successfully`
      );
      console.log(
        `[RevisionHistoryFetchService] 🚀 Browser ready for scraping!`
      );
      return true;
    } catch (error) {
      console.error(
        "[RevisionHistoryFetchService] Error launching browser:",
        error
      );
      return false;
    }
  }

  /**
   * Fetch all tickets from MongoDB
   */
  private async fetchAllTickets(): Promise<TicketData[]> {
    try {
      console.log(
        `\n[RevisionHistoryFetchService] 🎫 Step 3: Fetching all tickets for user: ${this.userId}`
      );

      const tickets = await Ticket.find({ userId: this.userId }).select(
        "airtableRecordId rowId baseId tableId fields"
      );

      console.log(
        `[RevisionHistoryFetchService] ✅ Found ${tickets.length} tickets to process`
      );

      return tickets.map((ticket) => ({
        airtableRecordId: ticket.airtableRecordId,
        rowId: ticket.rowId,
        baseId: ticket.baseId,
        tableId: ticket.tableId,
        fields: ticket.fields,
      }));
    } catch (error) {
      console.error(
        "[RevisionHistoryFetchService] Error fetching tickets:",
        error
      );
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
          columnHeader.attr("columnid") || columnHeader.attr("columnId") || "";

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
      console.error(
        "[RevisionHistoryFetchService] Error parsing HTML diff:",
        error
      );
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
   * Scrape revision history for a single ticket
   */
  private async scrapeRevisionHistoryForTicket(
    ticketData: TicketData
  ): Promise<RevisionHistoryItem[] | null> {
    try {
      if (!this.page) {
        throw new Error("Browser page not initialized");
      }

      const recordId = ticketData.airtableRecordId;
      console.log(
        `[RevisionHistoryFetchService]   🔍 Scraping record: ${recordId}`
      );

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
      console.log(
        `[RevisionHistoryFetchService]   📡 Making API request to fetch revision history...`
      );

      // Navigate to record page first (for referer and cookies)
      const recordUrl = `https://airtable.com/${ticketData.baseId}/${ticketData.tableId}/viwfbZDPk6u7uvwdH/${recordId}?blocks=show`;

      console.log(
        `[RevisionHistoryFetchService]   🌐 Navigating to record page...`
      );
      try {
        await this.page.goto(recordUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });
        console.log(
          `[RevisionHistoryFetchService]   ✅ Page loaded successfully`
        );
      } catch (navError) {
        console.warn(
          `[RevisionHistoryFetchService]   ⚠️  Navigation timeout for ${recordId}, continuing...`
        );
      }

      // Wait a bit for page to settle
      console.log(
        `[RevisionHistoryFetchService]   ⏳ Waiting 2s for page to settle...`
      );
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
          `[RevisionHistoryFetchService]   ❌ API request failed (Status ${response.status}): ${response.statusText}`
        );
        return null;
      }

      console.log(
        `[RevisionHistoryFetchService]   ✅ API response received (Status 200)`
      );

      // Parse revision history
      const revisions: RevisionHistoryItem[] = [];

      if (!response.data || !response.data.data) {
        return null;
      }

      const activityInfoById = response.data.data.rowActivityInfoById || {};
      const activityIds = Object.keys(activityInfoById);

      console.log(
        `[RevisionHistoryFetchService]   📊 Found ${activityIds.length} activities`
      );

      if (activityIds.length === 0) {
        console.log(
          `[RevisionHistoryFetchService]   ⚪ No revision history for this record`
        );
        return null; // No revision history
      }

      // Parse each activity
      console.log(
        `[RevisionHistoryFetchService]   🔍 Parsing HTML from ${activityIds.length} activities...`
      );
      for (const activityId of activityIds) {
        const activity = activityInfoById[activityId];
        const userId = activity.originatingUserId;

        if (activity.diffRowHtml) {
          const changes = this.parseHTMLDiff(activity.diffRowHtml);
          console.log(
            `[RevisionHistoryFetchService]     📝 Activity ${activityId}: Found ${changes.length} field changes`
          );

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

      console.log(
        `[RevisionHistoryFetchService]   ✅ Total revisions parsed: ${revisions.length}`
      );
      return revisions.length > 0 ? revisions : null;
    } catch (error) {
      console.error(
        `[RevisionHistoryFetchService] Error scraping record:`,
        error
      );
      throw error;
    }
  }

  /**
   * Cleanup
   */
  private async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log("[RevisionHistoryFetchService] Browser closed");
    }
  }

  /**
   * Main execution: Fetch all revision histories and store in MongoDB
   */
  async fetchAndStoreRevisionHistories(): Promise<any[]> {
    try {
      console.log(`\n${"=".repeat(70)}`);
      console.log(
        `[RevisionHistoryFetchService] 🚀 STARTING REVISION HISTORY FETCH`
      );
      console.log(`[RevisionHistoryFetchService] 👤 User ID: ${this.userId}`);
      console.log(
        `[RevisionHistoryFetchService] ⏰ Started at: ${new Date().toISOString()}`
      );
      console.log(`${"=".repeat(70)}`);

      // Fetch cookies
      const cookiesFetched = await this.fetchCookiesFromDB();
      if (!cookiesFetched) {
        throw new Error("Could not fetch cookies");
      }

      // Launch browser
      const browserLaunched = await this.launchBrowser();
      if (!browserLaunched) {
        throw new Error("Could not launch browser");
      }

      // Fetch all tickets
      const tickets = await this.fetchAllTickets();
      if (tickets.length === 0) {
        console.log(
          `[RevisionHistoryFetchService] ⚠️  No tickets found, exiting...`
        );
        await this.cleanup();
        return [];
      }

      console.log(`\n${"=".repeat(70)}`);
      console.log(
        `[RevisionHistoryFetchService] 🔄 Step 4: PROCESSING ${tickets.length} TICKETS`
      );
      console.log(`${"=".repeat(70)}\n`);

      const allRevisions: any[] = [];

      // Process all tickets
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const recordId = ticket.airtableRecordId;

        console.log(
          `\n[RevisionHistoryFetchService] 📌 [${i + 1}/${
            tickets.length
          }] Processing: ${recordId}`
        );

        try {
          const revisions = await this.scrapeRevisionHistoryForTicket(ticket);

          if (revisions && revisions.length > 0) {
            console.log(
              `[RevisionHistoryFetchService] ✅ Found ${revisions.length} revision items for ${recordId}`
            );

            // Store in MongoDB
            console.log(
              `[RevisionHistoryFetchService] 💾 Storing ${revisions.length} revisions in MongoDB...`
            );
            for (const revision of revisions) {
              try {
                const revisionDoc = await RevisionHistory.findOneAndUpdate(
                  { uuid: revision.uuid, issueId: revision.issueId },
                  {
                    uuid: revision.uuid,
                    issueId: revision.issueId,
                    columnType: revision.columnType,
                    oldValue: revision.oldValue || "",
                    newValue: revision.newValue || "",
                    createdDate: revision.createdDate,
                    authoredBy: revision.authoredBy,
                    baseId: ticket.baseId,
                    tableId: ticket.tableId,
                    userId: this.userId,
                  },
                  { upsert: true, new: true }
                );

                allRevisions.push(revisionDoc);
              } catch (dbError) {
                console.error(
                  `[RevisionHistoryFetchService] ❌ Error storing revision:`,
                  dbError
                );
              }
            }
            console.log(
              `[RevisionHistoryFetchService] ✅ Stored ${revisions.length} revisions in database`
            );
          } else {
            console.log(
              `[RevisionHistoryFetchService] ⚪ No revision history found for ${recordId}`
            );
          }
        } catch (error: any) {
          console.error(
            `[RevisionHistoryFetchService] ❌ Error processing ${recordId}:`,
            error.message
          );
        }

        // Small delay between requests
        console.log(
          `[RevisionHistoryFetchService] ⏳ Waiting 1s before next ticket...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Cleanup
      await this.cleanup();

      console.log(`\n${"=".repeat(70)}`);
      console.log(
        `[RevisionHistoryFetchService] 🎉 FETCH COMPLETED SUCCESSFULLY`
      );
      console.log(
        `[RevisionHistoryFetchService] 📊 Total revisions stored: ${allRevisions.length}`
      );
      console.log(
        `[RevisionHistoryFetchService] ⏰ Completed at: ${new Date().toISOString()}`
      );
      console.log(`${"=".repeat(70)}\n`);

      return allRevisions;
    } catch (error) {
      console.error("[RevisionHistoryFetchService] Unexpected error:", error);
      await this.cleanup();
      throw error;
    }
  }
}
