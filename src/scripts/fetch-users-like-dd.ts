import axios from "axios";
import mongoose from "mongoose";
import { decrypt } from "../utils/encryption";

const USER_ID = "user_1764605048688_4olm46hqw";
const WORKSPACE_ID = "wspFSDypvIF8fNgP3";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/airtable-integration";

async function fetchUsers() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log(" FETCHING WORKSPACE USERS - MATCHING DD FILE REQUEST");
    console.log("=".repeat(70) + "\n");

    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    const connection = await mongoose.connection
      .db!.collection("airtableconnections")
      .findOne({ userId: USER_ID });

    if (!connection) {
      console.log("✗ No connection found");
      process.exit(1);
    }

    console.log("✓ Found connection");

    if (!connection.cookies) {
      console.log("✗ No cookies found");
      process.exit(1);
    }

    const cookies = decrypt(connection.cookies);
    console.log(`✓ Decrypted cookies (${cookies.length} chars)\n`);

    console.log("Calling Airtable API with exact headers from dd file...\n");

    // Create axios instance matching the exact request from dd file
    const response = await axios.get(
      `https://airtable.com/v0.3/${WORKSPACE_ID}/workspace/workspaceSettings`,
      {
        headers: {
          accept: "*/*",
          "accept-encoding": "gzip, deflate, br, zstd",
          "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
          "cache-control": "no-cache",
          cookie: cookies,
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

    const billableUserBreakdown =
      response.data.workspaceData?.billableUserBreakdown;

    if (!billableUserBreakdown) {
      console.log("✗ No billableUserBreakdown found in response");
      process.exit(1);
    }

    const userProfiles =
      billableUserBreakdown.billableUserProfileInfoById || {};
    const collaborators = billableUserBreakdown.workspaceCollaborators || [];

    console.log(`✓ Found ${Object.keys(userProfiles).length} user profiles`);
    console.log(`✓ Found ${collaborators.length} collaborators\n`);

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

    console.log("=".repeat(70));
    console.log(" WORKSPACE USERS");
    console.log("=".repeat(70));
    console.log(JSON.stringify(users, null, 2));
    console.log("=".repeat(70) + "\n");

    console.log("✓ SUCCESS\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error("\n" + "=".repeat(70));
    console.error(" ERROR ✗");
    console.error("=".repeat(70));
    console.error("Message:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Status Text:", error.response.statusText);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
    console.error("=".repeat(70) + "\n");

    await mongoose.disconnect();
    process.exit(1);
  }
}

fetchUsers();
