/**
 * TEST USERS FETCH SCRIPT
 *
 * This script tests the UsersFetchService to verify it can successfully
 * fetch workspace users using cookie-based authentication.
 *
 * Usage:
 *   ts-node src/scripts/test-users-fetch.ts
 *
 * Prerequisites:
 *   - Valid cookies must be set in AirtableConnection for the test user
 *   - MongoDB connection must be available
 */

import mongoose from "mongoose";
import config from "../config";
import { AirtableConnection, WorkspaceUser } from "../models";
import { UsersFetchService } from "../services/UsersFetchService";

// Test configuration
const TEST_USER_ID = process.env.TEST_USER_ID || "test_user_123";

/**
 * Main test function
 */
async function testUsersFetch() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("USERS FETCH TEST SCRIPT");
    console.log("=".repeat(80));
    console.log(`Test User ID: ${TEST_USER_ID}`);
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log("=".repeat(80) + "\n");

    // Connect to MongoDB
    console.log("[STEP 1] Connecting to MongoDB...");
    await mongoose.connect(config.mongodb.uri);
    console.log("✓ Connected to MongoDB\n");

    // Check if user has cookies set
    console.log("[STEP 2] Checking for existing connection...");
    const connection = await AirtableConnection.findOne({
      userId: TEST_USER_ID,
    });

    if (!connection) {
      console.error("✗ No AirtableConnection found for user:", TEST_USER_ID);
      console.log("\nPlease ensure:");
      console.log(
        "1. User has cookies set via /api/airtable/cookies/set-cookies"
      );
      console.log("2. TEST_USER_ID environment variable is set correctly");
      console.log("\nExample:");
      console.log("  export TEST_USER_ID=your_actual_user_id");
      console.log("  ts-node src/scripts/test-users-fetch.ts\n");
      await cleanup();
      return;
    }

    console.log("✓ Found AirtableConnection");
    console.log(`  - Has cookies: ${!!connection.cookies}`);
    console.log(`  - Has scraped token: ${!!connection.scrapedAccessToken}`);
    console.log(`  - Has OAuth token: ${!!connection.accessToken}\n`);

    if (
      !connection.cookies &&
      !connection.scrapedAccessToken &&
      !connection.accessToken
    ) {
      console.error("✗ No valid credentials found");
      console.log("\nPlease set cookies or access token first.\n");
      await cleanup();
      return;
    }

    // Get count of existing users before fetch
    console.log("[STEP 3] Checking existing users in database...");
    const existingCount = await WorkspaceUser.countDocuments({
      userId: TEST_USER_ID,
    });
    console.log(`✓ Found ${existingCount} existing users in database\n`);

    // Create service and fetch users
    console.log("[STEP 4] Initializing UsersFetchService...");
    const service = new UsersFetchService(TEST_USER_ID);
    console.log("✓ Service initialized\n");

    console.log("[STEP 5] Fetching workspace users from Airtable...");
    console.log("-".repeat(80));
    const users = await service.fetchAndStoreWorkspaceUsers();
    console.log("-".repeat(80) + "\n");

    // Display results
    console.log("=".repeat(80));
    console.log("TEST RESULTS");
    console.log("=".repeat(80));
    console.log(`✓ Successfully fetched ${users.length} users from Airtable`);
    console.log(`✓ Users stored in database\n`);

    // Verify database storage
    console.log("[STEP 6] Verifying database storage...");
    const dbUsers = await WorkspaceUser.find({ userId: TEST_USER_ID })
      .sort({ createdTime: -1 })
      .lean();

    console.log(`✓ Found ${dbUsers.length} users in database\n`);

    // Display detailed user information
    console.log("=".repeat(80));
    console.log("FETCHED USERS DETAILS");
    console.log("=".repeat(80) + "\n");

    if (dbUsers.length === 0) {
      console.log("⚠ No users found. This might indicate:");
      console.log("  - Empty workspace");
      console.log("  - Invalid credentials");
      console.log("  - API endpoint issues\n");
    } else {
      dbUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   ID: ${user.airtableUserId}`);
        console.log(`   State: ${user.state}`);
        console.log(`   Created: ${user.createdTime || "N/A"}`);
        console.log(
          `   Invited By: ${user.invitedToAirtableByUserId || "N/A"}`
        );
        console.log("");
      });
    }

    // Summary
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Users before test: ${existingCount}`);
    console.log(`Users fetched from API: ${users.length}`);
    console.log(`Users in database now: ${dbUsers.length}`);
    console.log(`Status: ✓ TEST PASSED`);
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log("=".repeat(80) + "\n");

    await cleanup();
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("TEST FAILED");
    console.error("=".repeat(80));
    console.error("Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
    console.error("=".repeat(80) + "\n");

    await cleanup();
    process.exit(1);
  }
}

/**
 * Cleanup and disconnect
 */
async function cleanup() {
  console.log("Cleaning up...");
  await mongoose.disconnect();
  console.log("✓ Disconnected from MongoDB\n");
}

// Run the test
testUsersFetch();
