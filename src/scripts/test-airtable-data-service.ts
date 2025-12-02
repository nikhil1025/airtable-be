import mongoose from "mongoose";
import { AirtableDataService } from "../services/AirtableDataService";

const USER_ID = "user_1764605048688_4olm46hqw";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/airtable-integration";

async function testAirtableDataService() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log(" TESTING AirtableDataService.fetchAllWorkspaceUsers");
    console.log("=".repeat(70) + "\n");

    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    const service = new AirtableDataService();

    console.log("Fetching workspace users...\n");
    const result = await service.fetchAllWorkspaceUsers(USER_ID);

    console.log("\n" + "=".repeat(70));
    console.log(" SUCCESS ✓");
    console.log("=".repeat(70));
    console.log(`Found ${result.workspaceUsers.length} users:\n`);

    result.workspaceUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   ID: ${user.id}`);
      console.log(`   State: ${user.state}`);
      console.log(`   Created: ${user.createdTime}`);
      console.log("");
    });

    console.log("=".repeat(70) + "\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.log("\n" + "=".repeat(70));
    console.log(" ERROR ✗");
    console.log("=".repeat(70));
    console.log("Message:", error.message);
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    }
    console.log("=".repeat(70) + "\n");
    await mongoose.disconnect();
    process.exit(1);
  }
}

testAirtableDataService();
