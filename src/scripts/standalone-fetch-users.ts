/**
 * STANDALONE USER FETCH SCRIPT
 *
 * This script:
 * 1. Extracts cookies, accessToken, localStorage from MongoDB airtableconnections
 * 2. Parses cookies to readable format (like RevisionHistoryService)
 * 3. Makes API request with exact headers from context file (dd)
 * 4. Uses only axios (NO Puppeteer)
 */

import axios from "axios";
import mongoose from "mongoose";
import { decrypt } from "../utils/encryption";

// ============================================================================
// CONFIGURATION
// ============================================================================
const USER_ID = "user_1764605048688_4olm46hqw";
const WORKSPACE_ID = "wspFSDypvIF8fNgP3";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/airtable-integration";

// ============================================================================
// MAIN FUNCTION
// ============================================================================
async function fetchWorkspaceUsers() {
  let connection;

  try {
    console.log("\n" + "=".repeat(80));
    console.log(" STANDALONE WORKSPACE USERS FETCH");
    console.log("=".repeat(80) + "\n");

    // ------------------------------------------------------------------------
    // STEP 1: Connect to MongoDB
    // ------------------------------------------------------------------------
    console.log("📦 Step 1: Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // ------------------------------------------------------------------------
    // STEP 2: Extract credentials from airtableconnections collection
    // ------------------------------------------------------------------------
    console.log("📦 Step 2: Extracting credentials from database...");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }

    connection = await db
      .collection("airtableconnections")
      .findOne({ userId: USER_ID });

    if (!connection) {
      throw new Error(`No connection found for userId: ${USER_ID}`);
    }

    console.log("✓ Found airtableconnection document");
    console.log(`  - userId: ${connection.userId}`);
    console.log(`  - Has cookies: ${!!connection.cookies}`);
    console.log(`  - Has accessToken: ${!!connection.accessToken}`);
    console.log(`  - Has localStorage: ${!!connection.localStorage}`);
    console.log();

    // ------------------------------------------------------------------------
    // STEP 3: Decrypt and parse cookies
    // ------------------------------------------------------------------------
    console.log("📦 Step 3: Decrypting and parsing cookies...");

    if (!connection.cookies) {
      throw new Error("No cookies found in connection");
    }

    // Decrypt cookies
    const decryptedCookies = decrypt(connection.cookies);
    console.log(`✓ Decrypted cookies (${decryptedCookies.length} chars)`);

    // Parse cookies to readable format (like RevisionHistoryService)
    const cookieString = decryptedCookies
      .split(";")
      .map((cookie) => {
        const [name, ...valueParts] = cookie.trim().split("=");
        const value = valueParts.join("=");
        return name && value ? `${name.trim()}=${value.trim()}` : null;
      })
      .filter((c) => c !== null)
      .join("; ");

    console.log(`✓ Parsed cookies (${cookieString.length} chars)`);

    // Show first few cookies for verification
    const firstCookies = cookieString.split("; ").slice(0, 3);
    console.log(`  First 3 cookies:`);
    firstCookies.forEach((c) => {
      const [name] = c.split("=");
      console.log(`    - ${name}`);
    });
    console.log();

    // Decrypt accessToken (optional, not needed for this request)
    let accessToken = null;
    if (connection.accessToken) {
      accessToken = decrypt(connection.accessToken);
      console.log(`✓ Decrypted accessToken (${accessToken.length} chars)`);
      console.log(`  Starts with: ${accessToken.substring(0, 30)}...`);
    }

    // Decrypt localStorage (optional, for reference)
    let localStorage = null;
    if (connection.localStorage) {
      localStorage = decrypt(connection.localStorage);
      console.log(`✓ Decrypted localStorage (${localStorage.length} chars)`);
    }
    console.log();

    // ------------------------------------------------------------------------
    // STEP 4: Make API request with exact headers from dd context file
    // ------------------------------------------------------------------------
    console.log("📦 Step 4: Making API request to Airtable...");
    console.log(
      `  Endpoint: GET /v0.3/${WORKSPACE_ID}/workspace/workspaceSettings`
    );
    console.log(`  Base URL: https://airtable.com`);
    console.log();

    const response = await axios.get(
      `https://airtable.com/v0.3/${WORKSPACE_ID}/workspace/workspaceSettings`,
      {
        headers: {
          accept: "*/*",
          "accept-encoding": "gzip, deflate, br, zstd",
          "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
          "cache-control": "no-cache",
          cookie: cookieString,
          pragma: "no-cache",
          priority: "u=1, i",
          referer: `https://airtable.com/${WORKSPACE_ID}/workspace/billing`,
          "sec-ch-ua":
            '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Linux"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
          "x-airtable-inter-service-client": "webClient",
          "x-airtable-inter-service-client-code-version":
            "d1f79f49dadd77001a8cbf1cecec40d67239a95f",
          "x-requested-with": "XMLHttpRequest",
          "x-user-locale": "en",
        },
        timeout: 30000,
      }
    );

    console.log("✓ API request successful");
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log();

    // ------------------------------------------------------------------------
    // STEP 5: Parse and display users
    // ------------------------------------------------------------------------
    console.log("📦 Step 5: Parsing user data...");

    const billableUserBreakdown =
      response.data.workspaceData?.billableUserBreakdown;

    if (!billableUserBreakdown) {
      throw new Error("No billableUserBreakdown found in response");
    }

    const userProfiles =
      billableUserBreakdown.billableUserProfileInfoById || {};
    const collaborators = billableUserBreakdown.workspaceCollaborators || [];

    console.log(`✓ Found ${Object.keys(userProfiles).length} user profiles`);
    console.log(`✓ Found ${collaborators.length} collaborators`);
    console.log();

    // Build users array
    const users = [];
    for (const collaborator of collaborators) {
      const profile = userProfiles[collaborator.userId];
      if (profile) {
        users.push({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          profilePicUrl: profile.profilePicUrl,
          isServiceAccount: profile.isServiceAccount,
          permissionLevel: collaborator.permissionLevel,
          grantedByUserId: collaborator.grantedByUserId,
          createdTime: collaborator.createdTime,
        });
      }
    }

    // ------------------------------------------------------------------------
    // STEP 6: Display results
    // ------------------------------------------------------------------------
    console.log("=".repeat(80));
    console.log(" WORKSPACE USERS");
    console.log("=".repeat(80));
    console.log(JSON.stringify(users, null, 2));
    console.log("=".repeat(80));
    console.log();

    console.log("✅ SUCCESS - Fetched", users.length, "users");
    console.log();

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error("\n" + "=".repeat(80));
    console.error(" ❌ ERROR");
    console.error("=".repeat(80));
    console.error("Message:", error.message);

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Status Text:", error.response.statusText);
      console.error(
        "Response Data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }

    if (error.stack) {
      console.error("\nStack Trace:");
      console.error(error.stack);
    }

    console.error("=".repeat(80));
    console.error();

    await mongoose.disconnect();
    process.exit(1);
  }
}

// ============================================================================
// RUN
// ============================================================================
fetchWorkspaceUsers();
