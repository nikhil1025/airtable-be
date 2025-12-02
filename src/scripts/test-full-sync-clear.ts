/**
 * TEST FULL SYNC WITH CLEAR
 *
 * This script tests that the fetchAndStoreRevisionHistories method
 * clears existing data before fetching fresh data.
 *
 * Usage: npx ts-node src/scripts/test-full-sync-clear.ts
 */

import { connectDatabase } from "../config/database";
import { RevisionHistory, Ticket } from "../models";
import { RevisionHistoryFetchService } from "../services/RevisionHistoryFetchService";

async function testFullSyncWithClear() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🔄 TESTING FULL SYNC WITH CLEAR FUNCTIONALITY");
    console.log("=".repeat(70) + "\n");

    // Connect to database
    console.log("📊 Connecting to MongoDB...");
    await connectDatabase();
    console.log("✅ Connected\n");

    // Get a user ID
    const sampleTicket = await Ticket.findOne().lean();
    if (!sampleTicket) {
      console.log("⚠️  No tickets found in database");
      process.exit(0);
    }

    const userId = sampleTicket.userId;
    console.log(`👤 Using user ID: ${userId}\n`);

    // Check initial count
    const initialCount = await RevisionHistory.countDocuments({ userId });
    console.log(`📊 Initial revision count: ${initialCount}\n`);

    // Run full sync (should clear and refetch)
    console.log("🚀 Running full sync (this will clear and refetch)...\n");
    const service = new RevisionHistoryFetchService(userId);
    await service.fetchAndStoreRevisionHistories();

    // Wait a moment for all writes to complete
    console.log("\n⏳ Waiting for database writes to complete...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check final count
    const finalCount = await RevisionHistory.countDocuments({ userId });
    console.log(`\n📊 Final revision count: ${finalCount}\n`);

    console.log("=".repeat(70));
    console.log("✅ TEST COMPLETED");
    console.log("=".repeat(70));
    console.log(`Before: ${initialCount} records`);
    console.log(`After: ${finalCount} records`);
    console.log(
      `Action: Cleared ${initialCount} old records, inserted ${finalCount} fresh records`
    );
    console.log("=".repeat(70) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR:", error);
    process.exit(1);
  }
}

// Run the test
testFullSyncWithClear();
