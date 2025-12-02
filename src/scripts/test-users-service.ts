/**
 * Test script for UsersFetchService
 *
 * Tests all public methods:
 * 1. getWorkspaces() - Get list of workspaces
 * 2. fetchUsersForWorkspace(workspaceId) - Get users from specific workspace
 * 3. fetchUsersFromAllWorkspaces() - Get detailed results from all workspaces
 * 4. fetchAndStoreWorkspaceUsers() - Fetch and store all users in DB
 */

import { connect } from "mongoose";
import config from "../config";
import { UsersFetchService } from "../services/UsersFetchService";

const TEST_USER_ID = "user_1764605048688_4olm46hqw";

async function testUsersService() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log(" TESTING UsersFetchService - All Methods");
    console.log("=".repeat(80) + "\n");

    // Connect to MongoDB
    await connect(config.mongodb.uri);
    console.log("✓ Connected to MongoDB\n");

    const service = new UsersFetchService(TEST_USER_ID);

    // Test 1: Get Workspaces
    console.log("\n" + "=".repeat(80));
    console.log(" TEST 1: getWorkspaces()");
    console.log("=".repeat(80));
    const workspaces = await service.getWorkspaces();
    console.log(`\n✓ Found ${workspaces.length} workspaces:`);
    workspaces.forEach((ws, idx) => {
      console.log(`  ${idx + 1}. ${ws.workspaceName} (${ws.workspaceId})`);
    });

    // Test 2: Fetch users from specific workspace
    if (workspaces.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log(" TEST 2: fetchUsersForWorkspace()");
      console.log("=".repeat(80));
      const firstWorkspace = workspaces[0];
      const wsResult = await service.fetchUsersForWorkspace(
        firstWorkspace.workspaceId
      );
      console.log(`\n✓ Workspace: ${wsResult.workspaceName}`);
      console.log(`✓ Users: ${wsResult.users.length}`);
      wsResult.users.forEach((user, idx) => {
        console.log(
          `  ${idx + 1}. ${user.name} <${user.email}> - ${
            user.permissionLevel || "N/A"
          }`
        );
      });
    }

    // Test 3: Fetch from all workspaces (detailed)
    console.log("\n" + "=".repeat(80));
    console.log(" TEST 3: fetchUsersFromAllWorkspaces()");
    console.log("=".repeat(80));
    const allResults = await service.fetchUsersFromAllWorkspaces();
    console.log(`\n✓ Total workspaces: ${allResults.length}`);
    let totalUsers = 0;
    allResults.forEach((result, idx) => {
      console.log(`\n  Workspace ${idx + 1}: ${result.workspaceName}`);
      console.log(`    - Users: ${result.users.length}`);
      if (result.error) {
        console.log(`    - Error: ${result.error}`);
      }
      totalUsers += result.users.length;
    });
    console.log(`\n✓ Total users across all workspaces: ${totalUsers}`);

    // Test 4: Fetch and store (original method)
    console.log("\n" + "=".repeat(80));
    console.log(" TEST 4: fetchAndStoreWorkspaceUsers()");
    console.log("=".repeat(80));
    const storedUsers = await service.fetchAndStoreWorkspaceUsers();
    console.log(
      `\n✓ Fetched and stored ${storedUsers.length} users in MongoDB`
    );

    console.log("\n" + "=".repeat(80));
    console.log(" ALL TESTS PASSED ✓");
    console.log("=".repeat(80) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n✗ TEST FAILED:", error);
    process.exit(1);
  }
}

testUsersService();
