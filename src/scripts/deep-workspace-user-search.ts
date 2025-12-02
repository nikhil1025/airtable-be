/**
 * DYNAMIC WORKSPACE DISCOVERY & USER FETCH SCRIPT
 *
 * This script performs deep search to:
 * 1. Extract credentials from MongoDB
 * 2. Discover all workspaces the user has access to
 * 3. For each workspace, fetch all users
 * 4. Display comprehensive results
 *
 * Uses only axios (NO Puppeteer)
 */

import axios from "axios";
import mongoose from "mongoose";
import { decrypt } from "../utils/encryption";

// ============================================================================
// CONFIGURATION
// ============================================================================
const USER_ID = "user_1764605048688_4olm46hqw";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/airtable-integration";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse cookies to readable format (like RevisionHistoryService)
 */
function parseCookies(encryptedCookies: string): string {
  const decryptedCookies = decrypt(encryptedCookies);

  return decryptedCookies
    .split(";")
    .map((cookie) => {
      const [name, ...valueParts] = cookie.trim().split("=");
      const value = valueParts.join("=");
      return name && value ? `${name.trim()}=${value.trim()}` : null;
    })
    .filter((c) => c !== null)
    .join("; ");
}

/**
 * Get common headers for Airtable API requests
 */
function getAirtableHeaders(cookies: string, workspaceId?: string) {
  const headers: any = {
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    cookie: cookies,
    pragma: "no-cache",
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
    "x-requested-with": "XMLHttpRequest",
    "x-user-locale": "en",
  };

  if (workspaceId) {
    headers[
      "referer"
    ] = `https://airtable.com/${workspaceId}/workspace/billing`;
  } else {
    headers["referer"] = "https://airtable.com/";
  }

  return headers;
}

/**
 * Discover all workspaces the user has access to
 */
async function discoverWorkspaces(cookies: string): Promise<string[]> {
  console.log("📦 Discovering workspaces...");

  const workspaceIds: string[] = [];

  try {
    // Method 1: Try to get workspace list from home page data
    console.log("  Method 1: Fetching workspace list from API...");

    // Try the workspaces endpoint
    try {
      const response = await axios.get(
        "https://airtable.com/v0.3/meta/workspaces",
        {
          headers: getAirtableHeaders(cookies),
          timeout: 30000,
        }
      );

      if (response.data && response.data.workspaces) {
        const workspaces = response.data.workspaces;
        console.log(`  ✓ Found ${workspaces.length} workspaces from API`);

        workspaces.forEach((ws: any) => {
          workspaceIds.push(ws.id);
          console.log(`    - ${ws.id}: ${ws.name || "Unnamed"}`);
        });
      }
    } catch (error: any) {
      console.log(
        `  ✗ /meta/workspaces failed: ${
          error.response?.status || error.message
        }`
      );
    }

    // Method 2: Try user metadata endpoint
    if (workspaceIds.length === 0) {
      console.log("  Method 2: Fetching from user metadata...");
      try {
        const response = await axios.get(
          "https://airtable.com/v0.3/meta/whoami",
          {
            headers: getAirtableHeaders(cookies),
            timeout: 30000,
          }
        );

        if (response.data) {
          // Check for workspace ID in various fields
          const wsId =
            response.data.scopedToWorkspaceId ||
            response.data.workspaceId ||
            response.data.defaultWorkspaceId;

          if (wsId) {
            workspaceIds.push(wsId);
            console.log(`  ✓ Found workspace from metadata: ${wsId}`);
          }

          // Check for workspace list
          if (
            response.data.workspaces &&
            Array.isArray(response.data.workspaces)
          ) {
            response.data.workspaces.forEach((ws: any) => {
              const wsId = ws.id || ws.workspaceId;
              if (
                wsId &&
                typeof wsId === "string" &&
                !workspaceIds.includes(wsId)
              ) {
                workspaceIds.push(wsId);
                console.log(`    - ${wsId}: ${ws.name || "Unnamed"}`);
              }
            });
          }
        }
      } catch (error: any) {
        console.log(
          `  ✗ /meta/whoami failed: ${error.response?.status || error.message}`
        );
      }
    }

    // Method 3: Try home page HTML scraping
    if (workspaceIds.length === 0) {
      console.log("  Method 3: Scraping home page...");
      try {
        const response = await axios.get("https://airtable.com/", {
          headers: getAirtableHeaders(cookies),
          timeout: 30000,
        });

        // Look for workspace IDs in the HTML
        const html = String(response.data);
        const wspMatches = html.match(/wsp[a-zA-Z0-9]{14}/g) || [];
        const uniqueWsps = [...new Set(wspMatches)];

        if (uniqueWsps.length > 0) {
          console.log(`  ✓ Found ${uniqueWsps.length} workspace IDs in HTML`);
          uniqueWsps.forEach((wsId) => {
            if (typeof wsId === "string" && !workspaceIds.includes(wsId)) {
              workspaceIds.push(wsId);
              console.log(`    - ${wsId}`);
            }
          });
        }
      } catch (error: any) {
        console.log(
          `  ✗ Home page scraping failed: ${
            error.response?.status || error.message
          }`
        );
      }
    }

    // Method 4: Try common workspace endpoint patterns
    if (workspaceIds.length === 0) {
      console.log("  Method 4: Trying workspace enumeration...");

      // Try the default/fallback workspace ID from context
      const fallbackWsId = "wspFSDypvIF8fNgP3";
      try {
        const response = await axios.get(
          `https://airtable.com/v0.3/${fallbackWsId}/workspace/workspaceSettings`,
          {
            headers: getAirtableHeaders(cookies, fallbackWsId),
            timeout: 30000,
          }
        );

        if (response.status === 200) {
          workspaceIds.push(fallbackWsId);
          const wsName =
            response.data?.workspaceData?.workspaceName || "Unnamed";
          console.log(
            `  ✓ Verified fallback workspace: ${fallbackWsId} (${wsName})`
          );
        }
      } catch (error: any) {
        console.log(
          `  ✗ Fallback workspace failed: ${
            error.response?.status || error.message
          }`
        );
      }
    }
  } catch (error: any) {
    console.error(`  ✗ Workspace discovery failed: ${error.message}`);
  }

  if (workspaceIds.length === 0) {
    throw new Error(
      "Could not discover any workspaces. Please check credentials."
    );
  }

  console.log(`✓ Total workspaces discovered: ${workspaceIds.length}\n`);
  return workspaceIds;
}

/**
 * Fetch users for a specific workspace
 */
async function fetchWorkspaceUsers(workspaceId: string, cookies: string) {
  console.log(`📦 Fetching users for workspace: ${workspaceId}`);

  try {
    const response = await axios.get(
      `https://airtable.com/v0.3/${workspaceId}/workspace/workspaceSettings`,
      {
        headers: getAirtableHeaders(cookies, workspaceId),
        timeout: 30000,
      }
    );

    const workspaceData = response.data.workspaceData;
    const workspaceName = workspaceData?.workspaceName || "Unnamed Workspace";
    const billableUserBreakdown = workspaceData?.billableUserBreakdown;

    console.log(`  ✓ Workspace: ${workspaceName}`);

    if (!billableUserBreakdown) {
      console.log(`  ⚠ No user data available for this workspace\n`);
      return {
        workspaceId,
        workspaceName,
        users: [],
      };
    }

    const userProfiles =
      billableUserBreakdown.billableUserProfileInfoById || {};
    const collaborators = billableUserBreakdown.workspaceCollaborators || [];

    console.log(`  ✓ Found ${Object.keys(userProfiles).length} user profiles`);
    console.log(`  ✓ Found ${collaborators.length} collaborators\n`);

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

    return {
      workspaceId,
      workspaceName,
      users,
    };
  } catch (error: any) {
    console.error(
      `  ✗ Failed to fetch users: ${error.response?.status || error.message}\n`
    );
    return {
      workspaceId,
      workspaceName: "Unknown",
      users: [],
      error: error.message,
    };
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================
async function main() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log(" DYNAMIC WORKSPACE DISCOVERY & USER FETCH");
    console.log("=".repeat(80) + "\n");

    // Step 1: Connect to MongoDB
    console.log("📦 Step 1: Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Step 2: Get credentials from database
    console.log("📦 Step 2: Extracting credentials...");
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }

    const connection = await db
      .collection("airtableconnections")
      .findOne({ userId: USER_ID });

    if (!connection) {
      throw new Error(`No connection found for userId: ${USER_ID}`);
    }

    if (!connection.cookies) {
      throw new Error("No cookies found in connection");
    }

    const cookies = parseCookies(connection.cookies);
    console.log(`✓ Parsed cookies (${cookies.length} chars)\n`);

    // Step 3: Discover all workspaces
    console.log("📦 Step 3: Discovering workspaces...");
    const workspaceIds = await discoverWorkspaces(cookies);

    // Step 4: Fetch users for each workspace
    console.log("📦 Step 4: Fetching users from all workspaces...\n");
    const allResults = [];

    for (const workspaceId of workspaceIds) {
      const result = await fetchWorkspaceUsers(workspaceId, cookies);
      allResults.push(result);
    }

    // Step 5: Display comprehensive results
    console.log("=".repeat(80));
    console.log(" COMPREHENSIVE RESULTS");
    console.log("=".repeat(80) + "\n");

    allResults.forEach((result, index) => {
      console.log(
        `\n${index + 1}. Workspace: ${result.workspaceName} (${
          result.workspaceId
        })`
      );
      console.log("   " + "-".repeat(76));

      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
      } else if (result.users.length === 0) {
        console.log(`   ⚠ No users found`);
      } else {
        console.log(`   Users (${result.users.length}):`);
        result.users.forEach((user, idx) => {
          console.log(`   ${idx + 1}. ${user.name} <${user.email}>`);
          console.log(`      ID: ${user.id}`);
          console.log(`      Permission: ${user.permissionLevel}`);
          console.log(
            `      Created: ${new Date(user.createdTime).toLocaleString()}`
          );
          if (idx < result.users.length - 1) console.log();
        });
      }
    });

    console.log("\n" + "=".repeat(80));
    console.log("\n📊 Summary:");
    console.log(`   Total Workspaces: ${allResults.length}`);
    console.log(
      `   Total Users: ${allResults.reduce(
        (sum, r) => sum + r.users.length,
        0
      )}`
    );
    console.log("\n" + "=".repeat(80));

    // Display JSON output
    console.log("\n📄 JSON Output:\n");
    console.log(JSON.stringify(allResults, null, 2));
    console.log("\n" + "=".repeat(80));

    console.log("\n✅ SUCCESS\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error("\n" + "=".repeat(80));
    console.error(" ❌ ERROR");
    console.error("=".repeat(80));
    console.error("Message:", error.message);

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error(
        "Response Data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }

    if (error.stack) {
      console.error("\nStack Trace:");
      console.error(error.stack);
    }

    console.error("=".repeat(80) + "\n");

    await mongoose.disconnect();
    process.exit(1);
  }
}

// ============================================================================
// RUN
// ============================================================================
main();
