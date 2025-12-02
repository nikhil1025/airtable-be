/**
 * TEST CLEANUP DUPLICATES
 *
 * This script tests the duplicate cleanup functionality
 * Removes duplicate revision history records based on:
 * - newValue
 * - oldValue
 * - createdDate
 *
 * Usage: npx ts-node src/scripts/test-cleanup-duplicates.ts
 */

import { connectDatabase } from "../config/database";
import { RevisionHistory } from "../models";
import { RevisionHistoryFetchService } from "../services/RevisionHistoryFetchService";

async function testCleanupDuplicates() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🧹 TESTING DUPLICATE CLEANUP FUNCTIONALITY");
    console.log("=".repeat(70) + "\n");

    // Connect to database
    console.log("📊 Step 1: Connecting to MongoDB...");
    await connectDatabase();
    console.log("✅ Connected to MongoDB\n");

    // Get a user ID from existing data (prefer records with userId)
    console.log("👤 Step 2: Finding a user with revision histories...");
    const sampleRevision = await RevisionHistory.findOne({
      userId: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!sampleRevision) {
      console.log("⚠️  No revision histories with userId found in database");
      console.log("   Cleaning up all records regardless of userId\n");
    }

    const userId = sampleRevision?.userId;
    console.log(`✅ Using user ID: ${userId || "ALL USERS"}\n`);

    // Check initial state
    console.log("📊 Step 3: Checking initial state...");
    const query = userId ? { userId } : {};
    const initialCount = await RevisionHistory.countDocuments(query);
    console.log(`   Total records before cleanup: ${initialCount}\n`);

    // Run cleanup
    console.log("🔥 Step 4: Running cleanup...\n");
    const service = new RevisionHistoryFetchService(userId || "dummy");
    const result = await service.cleanupDuplicates(userId);

    // Verify results
    console.log("\n📊 Step 5: Verifying results...");
    const finalCount = await RevisionHistory.countDocuments(query);
    console.log(`   Total records after cleanup: ${finalCount}`);
    console.log(`   Records removed: ${initialCount - finalCount}\n`);

    // Summary
    console.log("=".repeat(70));
    console.log("✅ TEST COMPLETED SUCCESSFULLY");
    console.log("=".repeat(70));
    console.log(`Initial count: ${initialCount}`);
    console.log(`Final count: ${finalCount}`);
    console.log(`Duplicates removed: ${result.duplicatesRemoved}`);
    console.log(`Groups with duplicates: ${result.groupsProcessed}`);
    console.log("=".repeat(70) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR:", error);
    process.exit(1);
  }
}

// Run the test
testCleanupDuplicates();
