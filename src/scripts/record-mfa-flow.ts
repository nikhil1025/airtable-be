/**
 * Interactive MFA Flow Recording Script
 *
 * This script helps record the exact steps and selectors for Airtable MFA authentication.
 * Run this script and manually perform the login steps - it will log all page transitions,
 * available elements, and help us identify the correct selectors.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function analyzePage(page: Page, stepName: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`STEP: ${stepName}`);
  console.log(`${"=".repeat(80)}`);

  const url = page.url();
  console.log(`Current URL: ${url}`);

  const title = await page.title();
  console.log(`Page Title: ${title}`);

  // Get all forms on the page
  const forms = await page.evaluate(() => {
    const formElements = Array.from(document.querySelectorAll("form"));
    return formElements.map((form, idx) => ({
      index: idx,
      id: form.id || "no-id",
      action: form.action || "no-action",
      method: form.method || "no-method",
      inputCount: form.querySelectorAll("input").length,
      buttonCount: form.querySelectorAll("button").length,
    }));
  });

  console.log("\nForms found:", forms.length);
  forms.forEach((form) => {
    console.log(`  Form #${form.index}:`, form);
  });

  // Get all inputs
  const inputs = await page.evaluate(() => {
    const inputElements = Array.from(document.querySelectorAll("input"));
    return inputElements.map((input, idx) => ({
      index: idx,
      type: input.type,
      name: input.name || "no-name",
      id: input.id || "no-id",
      placeholder: input.placeholder || "no-placeholder",
      className: input.className,
      visible: input.offsetParent !== null,
    }));
  });

  console.log("\nInputs found:", inputs.length);
  inputs.forEach((input) => {
    console.log(`  Input #${input.index}:`, input);
  });

  // Get all buttons
  const buttons = await page.evaluate(() => {
    const buttonElements = Array.from(
      document.querySelectorAll(
        'button, input[type="submit"], input[type="button"]'
      )
    );
    return buttonElements.map((btn, idx) => ({
      index: idx,
      tagName: btn.tagName,
      type: (btn as any).type || "no-type",
      id: btn.id || "no-id",
      className: btn.className,
      textContent: btn.textContent?.trim() || "no-text",
      visible: btn.offsetParent !== null,
    }));
  });

  console.log("\nButtons/Submit elements found:", buttons.length);
  buttons.forEach((btn) => {
    console.log(`  Button #${btn.index}:`, btn);
  });

  // Get all labels (important for Airtable's hidden submit pattern)
  const labels = await page.evaluate(() => {
    const labelElements = Array.from(document.querySelectorAll("label"));
    return labelElements.map((label, idx) => ({
      index: idx,
      id: label.id || "no-id",
      className: label.className,
      textContent: label.textContent?.trim() || "no-text",
      innerHTML: label.innerHTML.substring(0, 200), // First 200 chars
      hasSubmitInput: label.querySelector('input[type="submit"]') !== null,
    }));
  });

  console.log("\nLabels found:", labels.length);
  labels.forEach((label) => {
    if (
      label.hasSubmitInput ||
      label.textContent?.toLowerCase().includes("submit")
    ) {
      console.log(`  ⭐ Label #${label.index} (possibly submit):`, label);
    }
  });

  console.log(`\n${"-".repeat(80)}\n`);
}

async function recordMFAFlow() {
  let browser: Browser | null = null;

  try {
    console.log("Starting Puppeteer browser in NON-HEADLESS mode...");
    console.log(
      "You will manually perform the login and we'll record the flow.\n"
    );

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });

    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("Navigating to Airtable login page...");
    await page.goto("https://airtable.com/login", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await analyzePage(page, "Initial Login Page");

    // Wait for user to enter email
    await question(
      "Press ENTER after you've entered your EMAIL (but DON'T click continue yet)..."
    );

    // Record email input details
    const emailValue = await page.evaluate(() => {
      const emailInput = document.querySelector(
        'input[name="email"], input[type="email"]'
      ) as HTMLInputElement;
      return emailInput ? emailInput.value : "not-found";
    });
    console.log(`Captured email: ${emailValue}`);

    await question(
      "Press ENTER after you've clicked CONTINUE and the password field appears..."
    );

    await analyzePage(page, "Password Page");

    // Wait for user to enter password
    await question(
      "Press ENTER after you've entered your PASSWORD (but DON'T click sign in yet)..."
    );

    // Record password field details (not the value!)
    const passwordFieldInfo = await page.evaluate(() => {
      const pwInput = document.querySelector(
        'input[type="password"]'
      ) as HTMLInputElement;
      if (!pwInput) return { found: false };
      return {
        found: true,
        name: pwInput.name,
        id: pwInput.id,
        className: pwInput.className,
        placeholder: pwInput.placeholder,
      };
    });
    console.log("Password field info:", passwordFieldInfo);

    await question(
      "Press ENTER after you've clicked SIGN IN and MFA page loads..."
    );

    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for page transition

    await analyzePage(page, "MFA Code Entry Page");

    // Analyze the MFA page in detail
    console.log("\n🔍 DETAILED MFA PAGE ANALYSIS 🔍");

    const mfaPageInfo = await page.evaluate(() => {
      // Get the form HTML
      const form = document.querySelector("form");
      const formHTML = form ? form.outerHTML : "no-form-found";

      // Get all clickable elements that might submit
      const clickables = Array.from(
        document.querySelectorAll(
          'label, button, input[type="submit"], div[role="button"]'
        )
      );
      const clickableInfo = clickables.map((el, idx) => ({
        index: idx,
        tagName: el.tagName,
        id: el.id || "no-id",
        className: el.className,
        textContent: el.textContent?.trim().substring(0, 50) || "no-text",
        hasSubmitInput: el.querySelector('input[type="submit"]') !== null,
        innerHTML: el.innerHTML.substring(0, 150),
      }));

      return {
        formHTML: formHTML.substring(0, 2000), // First 2000 chars
        clickableElements: clickableInfo,
      };
    });

    console.log("\n📝 FORM HTML (first 2000 chars):");
    console.log(mfaPageInfo.formHTML);

    console.log("\n🎯 CLICKABLE ELEMENTS:");
    mfaPageInfo.clickableElements.forEach((el) => {
      console.log(`  Element #${el.index}:`, el);
    });

    const mfaCode = await question(
      "\nEnter the MFA CODE you want to test with: "
    );

    // Try to enter MFA code
    console.log("\nAttempting to enter MFA code...");

    const mfaInputSelector = 'input[name="code"]';
    const mfaInput = await page.$(mfaInputSelector);

    if (mfaInput) {
      console.log(`✅ Found MFA input with selector: ${mfaInputSelector}`);
      await mfaInput.click();
      await mfaInput.type(mfaCode, { delay: 100 });
      console.log("✅ MFA code entered successfully");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now try different submit methods
      console.log("\n🧪 TESTING DIFFERENT SUBMIT METHODS...\n");

      // Method 1: Hidden submit input
      console.log("Method 1: Trying to click input[type='submit']...");
      const hiddenSubmit = await page.$('input[type="submit"]');
      if (hiddenSubmit) {
        const isVisible = await page.evaluate((el) => {
          return el.offsetParent !== null;
        }, hiddenSubmit);
        console.log(`  Found: YES | Visible: ${isVisible}`);

        const proceed = await question("  Try clicking this element? (y/n): ");
        if (proceed.toLowerCase() === "y") {
          try {
            await hiddenSubmit.click();
            console.log("  ✅ Click successful! Waiting for navigation...");
            await new Promise((resolve) => setTimeout(resolve, 3000));
            await analyzePage(page, "After Submit Method 1");
          } catch (error: any) {
            console.log(`  ❌ Click failed: ${error.message}`);
          }
        }
      } else {
        console.log("  Found: NO");
      }

      // Method 2: Label containing submit
      console.log(
        "\nMethod 2: Trying to click label containing input[type='submit']..."
      );
      const submitLabel = await page.$('label:has(input[type="submit"])');
      if (submitLabel) {
        console.log("  Found: YES");
        const proceed = await question("  Try clicking this element? (y/n): ");
        if (proceed.toLowerCase() === "y") {
          try {
            await submitLabel.click();
            console.log("  ✅ Click successful! Waiting for navigation...");
            await new Promise((resolve) => setTimeout(resolve, 3000));
            await analyzePage(page, "After Submit Method 2");
          } catch (error: any) {
            console.log(`  ❌ Click failed: ${error.message}`);
          }
        }
      } else {
        console.log("  Found: NO");
      }

      // Method 3: Evaluate and click via coordinates
      console.log("\nMethod 3: Trying JavaScript click on hidden submit...");
      const jsClickResult = await page.evaluate(() => {
        const submitInput = document.querySelector(
          'input[type="submit"]'
        ) as HTMLElement;
        if (submitInput) {
          submitInput.click();
          return { success: true, message: "Clicked via JavaScript" };
        }
        return { success: false, message: "Element not found" };
      });
      console.log(`  Result:`, jsClickResult);

      if (jsClickResult.success) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await analyzePage(page, "After Submit Method 3 (JS Click)");
      }

      // Method 4: Form submit
      console.log("\nMethod 4: Trying direct form.submit()...");
      const formSubmitResult = await page.evaluate(() => {
        const form = document.querySelector("form") as HTMLFormElement;
        if (form) {
          form.submit();
          return { success: true, message: "Form submitted via JavaScript" };
        }
        return { success: false, message: "Form not found" };
      });
      console.log(`  Result:`, formSubmitResult);

      if (formSubmitResult.success) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await analyzePage(page, "After Submit Method 4 (Form Submit)");
      }

      // Method 5: Press Enter key
      console.log("\nMethod 5: Trying to press Enter key on MFA input...");
      const proceed = await question("  Try pressing Enter? (y/n): ");
      if (proceed.toLowerCase() === "y") {
        await page.focus(mfaInputSelector);
        await page.keyboard.press("Enter");
        console.log("  ✅ Enter key pressed! Waiting for navigation...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await analyzePage(page, "After Submit Method 5 (Enter Key)");
      }
    } else {
      console.log("❌ Could not find MFA input field!");
    }

    console.log("\n\n🎉 RECORDING COMPLETE!");
    console.log("\nFinal URL:", page.url());

    await question("\nPress ENTER to close the browser and exit...");
  } catch (error: any) {
    console.error("Error during recording:", error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
    rl.close();
  }
}

// Run the script
console.log(
  "╔═══════════════════════════════════════════════════════════════╗"
);
console.log(
  "║         AIRTABLE MFA FLOW RECORDER                            ║"
);
console.log(
  "║                                                               ║"
);
console.log("║  This script will help us identify the correct selectors     ║");
console.log("║  and methods for automating MFA authentication.              ║");
console.log(
  "║                                                               ║"
);
console.log(
  "║  Instructions:                                                ║"
);
console.log("║  1. Browser will open to Airtable login                      ║");
console.log("║  2. Follow the prompts in this terminal                      ║");
console.log("║  3. Manually perform each step when asked                    ║");
console.log("║  4. We'll record all page details and test submit methods    ║");
console.log(
  "╚═══════════════════════════════════════════════════════════════╝"
);
console.log("\n");

recordMFAFlow().catch(console.error);
