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
    cookies?: Array<{ name: string; value: string }>;
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleLogin(data: any): Promise<any> {
  const { email, password, mfaCode } = data;
  let browser = null;
  let page = null;

  try {
    // Check if headless mode is disabled for debugging
    const isHeadless = process.env.PUPPETEER_HEADLESS !== 'false';
    console.log(`[PUPPETEER_WORKER] Launching browser (headless: ${isHeadless})...`);
    
    browser = await puppeteer.launch({
      headless: isHeadless,
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
      executablePath: process.env.CHROME_BIN || undefined, // Allow custom Chrome path
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

    // Handle MFA if needed
    const currentUrl = page.url();
    if (currentUrl.includes("mfa") || currentUrl.includes("verify")) {
      if (!mfaCode) throw new Error("MFA_REQUIRED");

      const mfaInput = await page.$(
        'input[name="verificationCode"], input[name="code"]'
      );
      if (mfaInput) {
        await mfaInput.click();
        await mfaInput.type(mfaCode, { delay: 50 });

        const mfaSubmit = await page.$('button[type="submit"]');
        if (mfaSubmit) {
          await mfaSubmit.click();
          await sleep(3000);
        }
      }
    }

    // Extract cookies
    const cookies = await page.cookies("https://airtable.com");
    console.log(`[PUPPETEER_WORKER] Extracted ${cookies.length} cookies`);

    return {
      success: true,
      cookies: cookies.map((c: any) => ({ name: c.name, value: c.value })),
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
    const isHeadless = process.env.PUPPETEER_HEADLESS !== 'false';
    console.log(`[PUPPETEER_WORKER] Launching browser for scraping (headless: ${isHeadless})...`);
    
    browser = await puppeteer.launch({
      headless: isHeadless,
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    page = await browser.newPage();
    console.log('[PUPPETEER_WORKER] Setting cookies for scraping...');

    // Set cookies
    await page.setCookie(...cookies);

    // Navigate and scrape
    console.log(`[PUPPETEER_WORKER] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const content = await page.content();
    console.log('[PUPPETEER_WORKER] Content scraped successfully');

    return {
      success: true,
      content,
    };
  } catch (error) {
    console.error('[PUPPETEER_WORKER] Scrape error:', error);
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
  const { baseId, tableId, recordId, cookies } = data;
  let browser = null;
  let page = null;

  try {
    const isHeadless = process.env.PUPPETEER_HEADLESS !== 'false';
    console.log(`[PUPPETEER_WORKER] Scraping revision history for record ${recordId}...`);
    
    browser = await puppeteer.launch({
      headless: isHeadless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Set cookies for authentication
    console.log('[PUPPETEER_WORKER] Setting authentication cookies...');
    await page.setCookie(...cookies);

    // Build the Airtable record URL
    const recordUrl = `https://airtable.com/${baseId}/${tableId}/${recordId}`;
    console.log(`[PUPPETEER_WORKER] Navigating to: ${recordUrl}`);

    await page.goto(recordUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await sleep(2000);

    // Click on the "History" or activity button to show revision history
    // Airtable's UI might have different selectors, we'll try common ones
    console.log('[PUPPETEER_WORKER] Looking for history/activity panel...');
    
    const historySelectors = [
      'button[aria-label*="History"]',
      'button[aria-label*="Activity"]',
      'button:has-text("History")',
      '[data-tutorial-selector-id="expandedRecordActivityButton"]',
      '.historyButton',
      '[class*="history"]',
    ];

    let historyButtonFound = false;
    for (const selector of historySelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          console.log(`[PUPPETEER_WORKER] Found history button with selector: ${selector}`);
          await button.click();
          historyButtonFound = true;
          await sleep(2000);
          break;
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }

    if (!historyButtonFound) {
      console.log('[PUPPETEER_WORKER] History button not found, checking if history is already visible...');
    }

    // Extract the page HTML to parse revision history
    const html = await page.content();
    console.log('[PUPPETEER_WORKER] Page content extracted');

    // Also try to extract structured data from the page
    const revisions = await page.evaluate(`() => {
      const changes = [];
      
      // Try to find activity items in the DOM
      const activityItems = document.querySelectorAll(
        '[class*="activity"], [class*="history"], [data-activity-id], .revision-item'
      );

      activityItems.forEach((item, index) => {
        try {
          const text = item.textContent || '';
          const timestamp = item.querySelector('[class*="timestamp"], [class*="date"], time')?.textContent || '';
          const user = item.querySelector('[class*="user"], [class*="author"]')?.textContent || '';
          
          changes.push({
            index,
            text: text.trim().substring(0, 500),
            timestamp,
            user,
            html: item.innerHTML.substring(0, 1000),
          });
        } catch (e) {
          console.error('Error extracting activity item:', e);
        }
      });

      return changes;
    }`) as any[];

    console.log(`[PUPPETEER_WORKER] Extracted ${revisions.length} revision items from DOM`);

    return {
      success: true,
      html,
      revisions,
      recordUrl,
    };
  } catch (error) {
    console.error('[PUPPETEER_WORKER] Revision history scrape error:', error);
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
    console.log('[PUPPETEER_WORKER] Received task:', task.type);
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

      console.log('[PUPPETEER_WORKER] Task completed:', { type: task.type, success: result.success });
      parentPort!.postMessage(result);
    } catch (error) {
      console.error('[PUPPETEER_WORKER] Task error:', error);
      parentPort!.postMessage({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });
  
  console.log('[PUPPETEER_WORKER] Worker thread initialized and ready');
}
