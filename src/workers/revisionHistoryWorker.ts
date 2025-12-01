import * as cheerio from "cheerio";
import puppeteer, { Browser, Page } from "puppeteer";
import { parentPort } from "worker_threads";

/**
 * Revision History Worker Thread
 * Processes individual ticket revision history scraping in parallel
 */

interface WorkerTask {
  type: "scrapeRevisionHistory";
  data: {
    ticketData: {
      airtableRecordId: string;
      rowId: string;
      baseId: string;
      tableId: string;
      fields: any;
    };
    cookies: string;
    workerId: number;
  };
}

interface RevisionHistoryItem {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: any;
  newValue: any;
  createdDate: Date;
  authoredBy: string;
}

/**
 * Parse HTML from diffRowHtml
 */
function parseHTMLDiff(html: string): Array<{
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
    console.error("[WORKER] Error parsing HTML diff:", error);
  }

  return changes;
}

/**
 * Generate random string for request IDs
 */
function generateRandomString(length: number): string {
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
async function scrapeRevisionHistoryForTicket(
  ticketData: {
    airtableRecordId: string;
    rowId: string;
    baseId: string;
    tableId: string;
    fields: any;
  },
  cookies: string,
  workerId: number
): Promise<RevisionHistoryItem[] | null> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const recordId = ticketData.airtableRecordId;
    console.log(`[WORKER-${workerId}]  Scraping record: ${recordId}`);

    // Launch browser
    console.log(`[WORKER-${workerId}]  Launching browser...`);
    browser = await puppeteer.launch({
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

    page = await browser.newPage();

    // Enable request interception
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      request.continue();
    });

    // Override navigator.webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
      (window as any).chrome = { runtime: {} };
    });

    // Set headers
    await page.setExtraHTTPHeaders({
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
    const cookieObjects = cookies
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
      `[WORKER-${workerId}]  Setting ${cookieObjects.length} cookies...`
    );
    for (const cookie of cookieObjects) {
      try {
        await page.setCookie(cookie as any);
      } catch (error) {
        // Ignore cookie errors
      }
    }

    // Build API URL
    const stringifiedObjectParams = JSON.stringify({
      limit: 100,
      offsetV2: null,
      shouldReturnDeserializedActivityItems: true,
      shouldIncludeRowActivityOrCommentUserObjById: true,
    });

    const requestId = `req${generateRandomString(16)}`;
    const secretSocketId = `soc${generateRandomString(16)}`;

    const apiUrl = `https://airtable.com/v0.3/row/${recordId}/readRowActivitiesAndComments`;
    const params = new URLSearchParams({
      stringifiedObjectParams,
      requestId,
      secretSocketId,
    });

    const fullUrl = `${apiUrl}?${params.toString()}`;

    // Navigate to record page first
    const recordUrl = `https://airtable.com/${ticketData.baseId}/${ticketData.tableId}/viwfbZDPk6u7uvwdH/${recordId}?blocks=show`;

    console.log(`[WORKER-${workerId}]  Navigating to record page...`);
    try {
      await page.goto(recordUrl, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
    } catch (navError) {
      console.warn(
        `[WORKER-${workerId}]   Navigation timeout, continuing...`
      );
    }

    // Wait for page to settle
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Make API request
    console.log(`[WORKER-${workerId}] 📡 Making API request...`);
    const response = await page.evaluate(
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
        `[WORKER-${workerId}]  API request failed (Status ${response.status})`
      );
      await browser.close();
      return null;
    }

    console.log(`[WORKER-${workerId}]  API response received`);

    // Parse revision history
    const revisions: RevisionHistoryItem[] = [];

    if (!response.data || !response.data.data) {
      await browser.close();
      return null;
    }

    const activityInfoById = response.data.data.rowActivityInfoById || {};
    const activityIds = Object.keys(activityInfoById);

    console.log(
      `[WORKER-${workerId}]  Found ${activityIds.length} activities`
    );

    if (activityIds.length === 0) {
      await browser.close();
      return null;
    }

    // Parse each activity
    for (const activityId of activityIds) {
      const activity = activityInfoById[activityId];
      const userId = activity.originatingUserId;

      if (activity.diffRowHtml) {
        const changes = parseHTMLDiff(activity.diffRowHtml);

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

    console.log(`[WORKER-${workerId}]  Parsed ${revisions.length} revisions`);

    await browser.close();
    return revisions.length > 0 ? revisions : null;
  } catch (error) {
    console.error(`[WORKER-${workerId}]  Error scraping:`, error);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

/**
 * Main worker message handler
 */
if (parentPort) {
  parentPort.on("message", async (task: WorkerTask) => {
    try {
      if (task.type === "scrapeRevisionHistory") {
        const revisions = await scrapeRevisionHistoryForTicket(
          task.data.ticketData,
          task.data.cookies,
          task.data.workerId
        );

        parentPort!.postMessage({
          success: true,
          revisions,
          recordId: task.data.ticketData.airtableRecordId,
        });
      } else {
        parentPort!.postMessage({
          success: false,
          error: "Unknown task type",
        });
      }
    } catch (error: any) {
      parentPort!.postMessage({
        success: false,
        error: error.message || "Unknown error",
        recordId: task.data.ticketData?.airtableRecordId,
      });
    }
  });
}
