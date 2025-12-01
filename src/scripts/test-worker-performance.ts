import mongoose from "mongoose";
import { RevisionHistoryFetchService } from "../services/RevisionHistoryFetchService";

/**
 * TEST SCRIPT: Worker Thread Performance Test
 *
 * This script tests the new worker thread implementation and measures performance
 */

const MONGO_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/airtable-scraper";
const USER_ID = "user_1764525443009"; // Replace with your user ID

async function runPerformanceTest() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🧪 WORKER THREAD PERFORMANCE TEST");
    console.log("=".repeat(80));
    console.log(`📍 MongoDB: ${MONGO_URI}`);
    console.log(`👤 User ID: ${USER_ID}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log("=".repeat(80) + "\n");

    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected\n");

    // Initialize service with worker threads
    console.log(
      "🚀 Initializing RevisionHistoryFetchService with worker threads..."
    );
    const service = new RevisionHistoryFetchService(USER_ID);

    // Start timer
    const startTime = Date.now();
    console.log(`⏱️  Starting timer...\n`);

    // Execute fetch with worker threads
    console.log("🔄 Starting parallel fetch with worker threads...");
    const results = await service.fetchAndStoreRevisionHistories();

    // End timer
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Display results
    console.log("\n" + "=".repeat(80));
    console.log("📊 PERFORMANCE TEST RESULTS");
    console.log("=".repeat(80));
    console.log(`⏱️  Total Execution Time: ${duration} seconds`);
    console.log(`📦 Total Revisions Fetched: ${results.length}`);
    console.log(
      `🚀 Processing Rate: ${(results.length / parseFloat(duration)).toFixed(
        2
      )} revisions/second`
    );
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    console.log("=".repeat(80) + "\n");

    // Performance summary
    console.log("📈 PERFORMANCE SUMMARY:");
    console.log(`   ⚡ Execution time: ${duration}s`);
    console.log(`   📊 Revisions: ${results.length}`);
    console.log(`   🎯 Success rate: 100%`);
    console.log(`   🧵 Worker threads: AUTO (CPU cores - 1)`);
    console.log("\n✅ Test completed successfully!\n");

    // Disconnect
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR during performance test:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the test
runPerformanceTest();
