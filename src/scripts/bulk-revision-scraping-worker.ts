import * as cheerio from "cheerio";
import puppeteer, { Browser, Page } from "puppeteer";
import { parentPort, workerData } from "worker_threads";

/**
 * WORKER THREAD FOR REVISION HISTORY SCRAPING
 *
 * This worker handles scraping revision history for a batch of tickets.
 * Each worker runs independently with its own browser instance.
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

interface WorkerInput {
  tickets: TicketData[];
  userId: string;
  cookies: string;
  workerId: number;
}

interface WorkerResult {
  recordId: string;
  status: "success" | "error" | "no_data";
  revisions: RevisionHistoryItem[] | null;
  error?: string;
}

class RevisionHistoryWorker {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cookies: string;
  private workerId: number;

  constructor(cookies: string, workerId: number) {
    this.cookies = cookies;
    this.workerId = workerId;
  }

  /**
   * Launch browser with CORS bypass
   */
  async launchBrowser(): Promise<boolean> {
    try {
      console.log(`[Worker ${this.workerId}] Launching browser...`);
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

      this.page = await this.browser.newPage();

      await this.page.setViewport({ width: 1920, height: 1080 });

      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });
      });

      await this.page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
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

      for (const cookie of cookieObjects) {
        try {
          await this.page.setCookie(cookie as any);
        } catch (error) {
          // Silently continue
        }
      }

      console.log(`[Worker ${this.workerId}] Browser ready`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse HTML from diffRowHtml
   */
  parseHTMLDiff(htmlString: string): Array<{
    columnType: string;
    oldValue: any;
    newValue: any;
  }> {
    const changes: Array<{
      columnType: string;
      oldValue: any;
      newValue: any;
    }> = [];

    try {
      const $ = cheerio.load(htmlString);

      $(".historicalCellContainer").each((_index, container) => {
        const $container = $(container);
        const columnHeader = $container.find(".micro.strong.caps");
        const columnType = columnHeader.text().trim();

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
            oldValue,
            newValue,
          });
        }
      });
    } catch (error) {
      console.error(
        `[Worker ${this.workerId}] Error parsing HTML diff:`,
        error
      );
    }

    return changes;
  }

  /**
   * Generate random string for request IDs
   */
  generateRandomString(length: number): string {
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
  async scrapeRevisionHistoryForTicket(
    ticketData: TicketData
  ): Promise<RevisionHistoryItem[] | null> {
    const recordId = ticketData.airtableRecordId;

    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    try {
      const stringifiedObjectParams = JSON.stringify({
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

      // Navigate to record page first
      const recordUrl = `https://airtable.com/${ticketData.baseId}/${ticketData.tableId}/viwfbZDPk6u7uvwdH/${recordId}?blocks=show`;

      console.log(`[Worker ${this.workerId}] Navigating to: ${recordUrl}`);
      try {
        await this.page.goto(recordUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });
        console.log(`[Worker ${this.workerId}] Navigation complete`);
      } catch (navError) {
        console.log(
          `[Worker ${this.workerId}] Navigation timeout, continuing...`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Make API request
      console.log(
        `[Worker ${this.workerId}] Making API request for ${recordId}`
      );
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

      console.log(
        `[Worker ${this.workerId}] API response status: ${response.status}`
      );

      if (!response.ok) {
        console.log(
          `[Worker ${this.workerId}] API request failed: ${response.statusText}`
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

      console.log(
        `[Worker ${this.workerId}] Found ${activityIds.length} activities for ${recordId}`
      );

      if (activityIds.length === 0) {
        return null;
      }

      // Parse each activity
      for (const activityId of activityIds) {
        const activity = activityInfoById[activityId];
        const userId = activity.originatingUserId;

        if (activity.diffRowHtml) {
          const changes = this.parseHTMLDiff(activity.diffRowHtml);
          console.log(
            `[Worker ${this.workerId}] Activity ${activityId}: found ${changes.length} changes`
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
        } else {
          console.log(
            `[Worker ${this.workerId}] Activity ${activityId}: no diffRowHtml`
          );
        }
      }

      console.log(
        `[Worker ${this.workerId}] Total revisions parsed: ${revisions.length}`
      );

      return revisions.length > 0 ? revisions : null;
    } catch (error: any) {
      throw new Error(`Failed to scrape ${recordId}: ${error.message}`);
    }
  }

  /**
   * Process all tickets assigned to this worker
   */
  async processTickets(tickets: TicketData[]): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];

    console.log(
      `[Worker ${this.workerId}] Starting to process ${tickets.length} tickets`
    );

    // Launch browser
    const browserLaunched = await this.launchBrowser();
    if (!browserLaunched) {
      // Return all as errors
      return tickets.map((ticket) => ({
        recordId: ticket.airtableRecordId,
        status: "error",
        revisions: null,
        error: "Failed to launch browser",
      }));
    }

    // Process each ticket
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const recordId = ticket.airtableRecordId;

      console.log(
        `[Worker ${this.workerId}] Processing ticket ${i + 1}/${
          tickets.length
        }: ${recordId}`
      );

      try {
        const revisions = await this.scrapeRevisionHistoryForTicket(ticket);

        if (revisions === null) {
          console.log(`[Worker ${this.workerId}] No data for ${recordId}`);
          results.push({
            recordId,
            status: "no_data",
            revisions: null,
          });
        } else {
          console.log(
            `[Worker ${this.workerId}] Success: ${revisions.length} revisions for ${recordId}`
          );
          results.push({
            recordId,
            status: "success",
            revisions,
          });
        }
      } catch (error: any) {
        console.error(
          `[Worker ${this.workerId}] Error for ${recordId}:`,
          error.message
        );
        results.push({
          recordId,
          status: "error",
          revisions: null,
          error: error.message,
        });
      }

      // Small delay between requests
      if (i < tickets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Cleanup
    if (this.browser) {
      await this.browser.close();
    }

    return results;
  }
}

// Worker thread execution
(async () => {
  try {
    const { tickets, cookies, workerId } = workerData as WorkerInput;

    console.log(`[Worker ${workerId}] Starting with ${tickets.length} tickets`);

    const worker = new RevisionHistoryWorker(cookies, workerId);
    const results = await worker.processTickets(tickets);

    console.log(`[Worker ${workerId}] Completed successfully`);

    // Send results back to parent
    parentPort?.postMessage({ success: true, results });
  } catch (error: any) {
    console.error(`[Worker] Error:`, error);
    parentPort?.postMessage({
      success: false,
      error: error.message || error.toString(),
    });
  }
})();
