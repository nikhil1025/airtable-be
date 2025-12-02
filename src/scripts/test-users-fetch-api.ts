/**
 * TEST USERS FETCH API ENDPOINT
 *
 * This script tests the GET /api/users/fetch/:userId endpoint
 * to verify it can successfully fetch workspace users using cookie-based authentication.
 *
 * Usage:
 *   ts-node src/scripts/test-users-fetch-api.ts
 *
 * Prerequisites:
 *   - Backend server must be running (npm run dev)
 *   - Valid cookies must be set in AirtableConnection for the test user
 *   - Set TEST_USER_ID environment variable
 */

import axios from "axios";

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const TEST_USER_ID = process.env.TEST_USER_ID || "test_user_123";

/**
 * Main test function
 */
async function testUsersFetchAPI() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("USERS FETCH API ENDPOINT TEST");
    console.log("=".repeat(80));
    console.log(`API Base URL: ${API_BASE_URL}`);
    console.log(`Test User ID: ${TEST_USER_ID}`);
    console.log(`Endpoint: GET /api/users/fetch/${TEST_USER_ID}`);
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log("=".repeat(80) + "\n");

    // Test the endpoint
    console.log("[STEP 1] Sending request to fetch users endpoint...");
    const startTime = Date.now();

    const response = await axios.get(
      `${API_BASE_URL}/api/users/fetch/${TEST_USER_ID}`,
      {
        timeout: 60000, // 60 second timeout for slow responses
      }
    );

    const duration = Date.now() - startTime;

    console.log(`✓ Request completed in ${duration}ms\n`);

    // Check response
    console.log("[STEP 2] Analyzing response...");
    console.log(`Status Code: ${response.status}`);
    console.log(`Success: ${response.data.success}\n`);

    if (!response.data.success) {
      console.error("✗ API returned success: false");
      console.error("Response:", JSON.stringify(response.data, null, 2));
      process.exit(1);
    }

    // Display results
    const { totalUsers, users } = response.data.data;

    console.log("=".repeat(80));
    console.log("RESULTS");
    console.log("=".repeat(80));
    console.log(`Total Users Fetched: ${totalUsers}`);
    console.log(`Message: ${response.data.message}\n`);

    if (totalUsers === 0) {
      console.log("⚠ No users found. This might indicate:");
      console.log("  - Empty workspace");
      console.log("  - Invalid credentials");
      console.log("  - Cookies not set properly\n");
    } else {
      console.log("=".repeat(80));
      console.log("USER DETAILS");
      console.log("=".repeat(80) + "\n");

      users.forEach((user: any, index: number) => {
        console.log(`${index + 1}. ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   State: ${user.state}`);
        console.log(`   Created: ${user.createdTime || "N/A"}`);
        console.log(`   Last Activity: ${user.lastActivityTime || "N/A"}`);
        console.log(`   Invited By: ${user.invitedBy || "N/A"}`);
        console.log("");
      });
    }

    // Summary
    console.log("=".repeat(80));
    console.log("TEST SUMMARY");
    console.log("=".repeat(80));
    console.log(`✓ API Endpoint: Working`);
    console.log(`✓ Authentication: Successful`);
    console.log(`✓ Users Fetched: ${totalUsers}`);
    console.log(`✓ Response Time: ${duration}ms`);
    console.log(`✓ Status: TEST PASSED`);
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log("=".repeat(80) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("TEST FAILED");
    console.error("=".repeat(80));

    if (axios.isAxiosError(error)) {
      console.error(`Status Code: ${error.response?.status || "N/A"}`);
      console.error(`Error Message: ${error.message}`);

      if (error.response) {
        console.error("\nResponse Data:");
        console.error(JSON.stringify(error.response.data, null, 2));
      } else if (error.code === "ECONNREFUSED") {
        console.error("\n✗ Connection refused. Is the backend server running?");
        console.error("  Start the server with: npm run dev");
      }
    } else {
      console.error("Error:", error);
    }

    console.error("=".repeat(80) + "\n");
    process.exit(1);
  }
}

// Run the test
testUsersFetchAPI();
