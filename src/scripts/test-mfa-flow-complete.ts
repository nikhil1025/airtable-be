/**
 * COMPREHENSIVE MFA FLOW TEST SCRIPT
 *
 * This script tests the complete MFA authentication flow:
 * 1. User enters email/password in settings
 * 2. Puppeteer opens, fills credentials, and pauses at MFA page
 * 3. Frontend modal opens for user to enter MFA code
 * 4. User submits MFA code
 * 5. Puppeteer completes login and extracts all cookies
 * 6. Cookies are validated
 *
 * Tests with MongoDB Project model to ensure proper integration
 */

import mongoose from "mongoose";
import readline from "readline";
import { Project } from "../models";
import { EnhancedCookieValidator } from "../services/EnhancedCookieValidator";
import { mfaAuthService } from "../services/MFAAuthService";

// Configuration
const TEST_CONFIG = {
  email: "", // Will be prompted
  password: "", // Will be prompted
  baseId: "appMeCVHbYCljHyu5", // Your test base ID
  userId: "test-user-" + Date.now(), // Unique test user ID
};

// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/airtable-test";

/**
 * Create readline interface for user input
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Prompt user for input
 */
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Main test runner
 */
async function setup() {
  console.log("\n🔧 Setting up test environment...\n");

  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected to MongoDB");

  // Get user credentials
  TEST_CONFIG.email = await prompt("Enter Airtable email: ");
  TEST_CONFIG.password = await prompt("Enter Airtable password: ");

  // Create or update test project
  await Project.findOneAndUpdate(
    { userId: TEST_CONFIG.userId },
    {
      userId: TEST_CONFIG.userId,
      airtableBaseId: TEST_CONFIG.baseId,
      name: "MFA Test Project",
      tables: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { upsert: true }
  );
  console.log("✓ Test project created/updated in MongoDB");

  console.log("\n📋 Test Configuration:");
  console.log(`   User ID: ${TEST_CONFIG.userId}`);
  console.log(`   Email: ${TEST_CONFIG.email}`);
  console.log(`   Base ID: ${TEST_CONFIG.baseId}`);
  console.log("\n");
}

/**
 * Test Step 1: Initiate Login
 */
async function testInitiateLogin(): Promise<string | null> {
  console.log("\n" + "=".repeat(60));
  console.log("📝 STEP 1: INITIATE LOGIN");
  console.log("=".repeat(60) + "\n");

  console.log("Starting login initiation...");
  console.log("This will:");
  console.log("  1. Open Puppeteer browser (non-headless)");
  console.log("  2. Navigate to Airtable login");
  console.log("  3. Fill email and password");
  console.log("  4. Pause at MFA page");
  console.log("\n");

  const result = await mfaAuthService.initiateLogin(
    TEST_CONFIG.email,
    TEST_CONFIG.password,
    TEST_CONFIG.baseId,
    TEST_CONFIG.userId
  );

  console.log("\n📊 Initiate Login Result:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    throw new Error(`Login initiation failed: ${result.error}`);
  }

  if (!result.requiresMFA) {
    console.log("\n⚠️  No MFA required - cookies already extracted!");
    return null;
  }

  console.log("\n✓ Login initiated successfully");
  console.log(`✓ Session ID: ${result.sessionId}`);
  console.log("\n🔐 MFA REQUIRED - Browser should be paused at MFA page");

  return result.sessionId || null;
}

/**
 * Test Step 2: Submit MFA Code
 */
async function testSubmitMFA(sessionId: string) {
  console.log("\n" + "=".repeat(60));
  console.log("📝 STEP 2: SUBMIT MFA CODE");
  console.log("=".repeat(60) + "\n");

  console.log("Please check the Puppeteer browser window.");
  console.log("You should see the MFA code input page.");
  console.log("\n");

  // Prompt for MFA code
  const mfaCode = await prompt("Enter your MFA code from authenticator app: ");

  console.log("\n⏳ Submitting MFA code...");
  console.log("This will:");
  console.log("  1. Fill MFA code in Puppeteer");
  console.log("  2. Submit the form");
  console.log("  3. Navigate to multiple pages (home, workspace, base)");
  console.log("  4. Extract all cookies from all domains");
  console.log("  5. Extract localStorage data");
  console.log("  6. Attempt to extract access token");
  console.log("  7. Save everything to MongoDB");
  console.log("\n");

  const result = await mfaAuthService.submitMFA(sessionId, mfaCode);

  console.log("\n📊 Submit MFA Result:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    throw new Error(`MFA submission failed: ${result.error}`);
  }

  console.log("\n✓ MFA submitted successfully");
  console.log(`✓ Cookies extracted: ${result.cookies?.length || 0}`);
  console.log(
    `✓ localStorage items: ${Object.keys(result.localStorage || {}).length}`
  );
  console.log("\n🎉 Browser window should now be closed");
}

/**
 * Test Step 3: Validate Cookies
 */
async function testValidateCookies() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 STEP 3: VALIDATE COOKIES");
  console.log("=".repeat(60) + "\n");

  console.log("⏳ Validating extracted cookies...");
  console.log("This will:");
  console.log("  1. Retrieve cookies from MongoDB");
  console.log("  2. Check cookie format and structure");
  console.log("  3. Test cookies against Airtable workspace");
  console.log("  4. Verify authentication works");
  console.log("\n");

  const validation =
    await EnhancedCookieValidator.validateAllAuthenticationData(
      TEST_CONFIG.userId
    );

  console.log("\n📊 Validation Result:");
  console.log(JSON.stringify(validation, null, 2));

  if (!validation.isValid) {
    throw new Error("Cookie validation failed!");
  }

  console.log("\n✓ Cookies are valid and working!");
  console.log("✓ Authentication successful");
}

/**
 * Test Step 4: Verify Data in MongoDB
 */
async function testVerifyDatabase() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 STEP 4: VERIFY DATABASE STORAGE");
  console.log("=".repeat(60) + "\n");

  const { AirtableConnection } = require("../models");

  const connection = await AirtableConnection.findOne({
    userId: TEST_CONFIG.userId,
  });

  if (!connection) {
    throw new Error("No connection found in database!");
  }

  console.log("✓ Connection found in MongoDB");
  console.log(`✓ Has cookies: ${!!connection.cookies}`);
  console.log(`✓ Has localStorage: ${!!connection.localStorage}`);
  console.log(`✓ Has scraped access token: ${!!connection.scrapedAccessToken}`);
  console.log(
    `✓ Cookies valid until: ${
      connection.cookiesValidUntil?.toISOString() || "Not set"
    }`
  );
  const lastUpdatedStr = connection.lastUpdated
    ? connection.lastUpdated.toISOString()
    : connection.updatedAt
    ? connection.updatedAt.toISOString()
    : "Unknown";
  console.log(`✓ Last updated: ${lastUpdatedStr}`);

  // Decrypt and show cookie count
  if (connection.cookies) {
    const { decrypt } = require("../utils/encryption");
    const decryptedCookies = decrypt(connection.cookies);
    const cookiesArray = JSON.parse(decryptedCookies);
    console.log(`✓ Total cookies stored: ${cookiesArray.length}`);
    console.log(
      `✓ Cookie names: ${cookiesArray.map((c: any) => c.name).join(", ")}`
    );
  }

  // Decrypt and show localStorage count
  if (connection.localStorage) {
    const { decrypt } = require("../utils/encryption");
    const decryptedLS = decrypt(connection.localStorage);
    const lsObject = JSON.parse(decryptedLS);
    console.log(`✓ Total localStorage items: ${Object.keys(lsObject).length}`);
    console.log(`✓ localStorage keys: ${Object.keys(lsObject).join(", ")}`);
  }

  // Show access token if available
  if (connection.scrapedAccessToken) {
    const { decrypt } = require("../utils/encryption");
    const token = decrypt(connection.scrapedAccessToken);
    console.log(
      `✓ Access token (first 20 chars): ${token.substring(0, 20)}...`
    );
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  console.log("\n" + "=".repeat(60));
  console.log("🧹 CLEANUP");
  console.log("=".repeat(60) + "\n");

  const shouldCleanup = await prompt(
    "Do you want to cleanup test data? (yes/no): "
  );

  if (shouldCleanup.toLowerCase() === "yes") {
    const { AirtableConnection } = require("../models");

    await AirtableConnection.deleteOne({ userId: TEST_CONFIG.userId });
    await Project.deleteOne({ userId: TEST_CONFIG.userId });

    console.log("✓ Test data cleaned up from MongoDB");
  } else {
    console.log("⚠️  Test data preserved in MongoDB");
    console.log(`   User ID: ${TEST_CONFIG.userId}`);
  }

  rl.close();
  await mongoose.disconnect();
  console.log("✓ Disconnected from MongoDB");
}

/**
 * Main test runner
 */
async function main() {
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       COMPREHENSIVE MFA FLOW TEST SCRIPT                  ║");
  console.log("║                                                           ║");
  console.log("║  This script tests the complete end-to-end MFA flow      ║");
  console.log("║  with real-time Puppeteer browser interaction            ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("\n");

  let sessionId: string | null = null;

  try {
    // Setup
    await setup();

    // Step 1: Initiate Login
    sessionId = await testInitiateLogin();

    // If no MFA required, skip to validation
    if (!sessionId) {
      await testValidateCookies();
      await testVerifyDatabase();
    } else {
      // Step 2: Submit MFA
      await testSubmitMFA(sessionId);

      // Step 3: Validate Cookies
      await testValidateCookies();

      // Step 4: Verify Database
      await testVerifyDatabase();
    }

    console.log("\n");
    console.log(
      "╔═══════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                   🎉 ALL TESTS PASSED! 🎉                 ║"
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════╝"
    );
    console.log("\n");

    // Cleanup
    await cleanup();

    process.exit(0);
  } catch (error: any) {
    console.error("\n");
    console.error(
      "╔═══════════════════════════════════════════════════════════╗"
    );
    console.error(
      "║                   ❌ TEST FAILED ❌                        ║"
    );
    console.error(
      "╚═══════════════════════════════════════════════════════════╝"
    );
    console.error("\n");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    // Cleanup on error
    try {
      rl.close();
      await mongoose.disconnect();
    } catch (e) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the test
main();
