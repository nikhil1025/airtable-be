/**
 * Quick test to fetch and display users from Airtable API
 */

import axios from "axios";
import mongoose from "mongoose";
import config from "../config";
import { AirtableConnection } from "../models";
import { decrypt } from "../utils/encryption";

const WORKSPACE_ID = "wspFSDypvIF8fNgP3"; // From context file
const USER_ID = "user_1764605048688_4olm46hqw";

async function fetchUsers() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log(" FETCHING WORKSPACE USERS - QUICK TEST");
    console.log("=".repeat(70) + "\n");

    // Connect to MongoDB
    await mongoose.connect(config.mongodb.uri);
    console.log("✓ Connected to MongoDB\n");

    // Get connection
    const connection = await AirtableConnection.findOne({ userId: USER_ID });
    if (!connection) {
      console.log("✗ No connection found");
      process.exit(1);
    }

    console.log("✓ Found connection");

    // Decrypt credentials
    const cookies = connection.cookies ? decrypt(connection.cookies) : "";
    const accessToken = connection.accessToken
      ? decrypt(connection.accessToken)
      : "";

    console.log(`✓ Decrypted cookies (${cookies.length} chars)`);
    console.log(`✓ Decrypted access token (${accessToken.length} chars)`);
    console.log(`  Token starts with: ${accessToken.substring(0, 50)}...\n`);

    console.log("Calling Airtable API...");
    console.log(`Testing with Bearer token + cookies...\n`);

    // Try with both Bearer token and cookies
    const axiosInstance = axios.create({
      baseURL: "https://airtable.com",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      },
      timeout: 30000,
    });

    console.log(`Calling: /v0.3/${WORKSPACE_ID}/workspace/workspaceSettings\n`);

    // Fetch workspace settings
    const response = await axiosInstance.get(
      `/v0.3/${WORKSPACE_ID}/workspace/workspaceSettings`
    );

    const billableUserBreakdown =
      response.data.workspaceData?.billableUserBreakdown;

    if (!billableUserBreakdown) {
      console.log("✗ No billableUserBreakdown found in response");
      process.exit(1);
    }

    const userProfiles =
      billableUserBreakdown.billableUserProfileInfoById || {};
    const collaborators = billableUserBreakdown.workspaceCollaborators || [];

    console.log("=".repeat(70));
    console.log(" WORKSPACE USERS");
    console.log("=".repeat(70) + "\n");

    const users: any[] = [];

    // Combine profile and collaborator data
    for (const collaborator of collaborators) {
      const profile = userProfiles[collaborator.userId];
      if (profile) {
        users.push({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          createdTime: collaborator.createdTime,
          grantedBy: collaborator.grantedByUserId,
        });
      }
    }

    // Display in array format
    console.log(`Total Users: ${users.length}\n`);
    console.log(JSON.stringify(users, null, 2));

    console.log("\n" + "=".repeat(70));
    console.log(" SUCCESS ✓");
    console.log("=".repeat(70) + "\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error("\n" + "=".repeat(70));
    console.error(" ERROR ✗");
    console.error("=".repeat(70));
    console.error("Message:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
    console.error("=".repeat(70) + "\n");

    await mongoose.disconnect();
    process.exit(1);
  }
}

fetchUsers();
