import dotenv from "dotenv";
import mongoose from "mongoose";
import { RevisionHistory } from "../models";

dotenv.config();

/**
 * Script to remove ALL duplicate revision history entries across all records
 * Keeps one entry and removes duplicates based on:
 * - issueId (record ID)
 * - newValue
 * - oldValue
 * - createdDate
 */

async function cleanupAllDuplicates() {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/airtable-integration";
    await mongoose.connect(mongoUri);
    console.log("[INFO] Connected to MongoDB\n");

    // Get all revisions
    console.log("[INFO] Fetching all revision history records...");
    const allRevisions = await RevisionHistory.find({}).sort({
      createdDate: 1,
    });
    console.log(`[INFO] Found ${allRevisions.length} total revision records\n`);

    if (allRevisions.length === 0) {
      console.log("[WARNING] No revisions found");
      await mongoose.connection.close();
      return;
    }

    // Group by issueId + newValue + oldValue + createdDate
    const groupedRevisions = new Map<string, any[]>();

    allRevisions.forEach((revision) => {
      const key = `${revision.issueId}|${revision.newValue}|${
        revision.oldValue
      }|${revision.createdDate.toISOString()}`;

      if (!groupedRevisions.has(key)) {
        groupedRevisions.set(key, []);
      }
      groupedRevisions.get(key)!.push(revision);
    });

    console.log(
      `[INFO] Found ${groupedRevisions.size} unique revision groups\n`
    );

    let totalDuplicates = 0;
    let duplicateGroups = 0;
    const idsToDelete: string[] = [];
    const affectedRecords = new Set<string>();

    // Find duplicates
    groupedRevisions.forEach((group) => {
      if (group.length > 1) {
        duplicateGroups++;
        const duplicateCount = group.length - 1;
        totalDuplicates += duplicateCount;
        affectedRecords.add(group[0].issueId);

        console.log(`[DUPLICATE] Duplicate group (${group.length} entries):`);
        console.log(`   Record ID: ${group[0].issueId}`);
        console.log(`   Column: ${group[0].columnType}`);
        console.log(
          `   Old Value: "${group[0].oldValue?.substring(0, 50)}${
            group[0].oldValue?.length > 50 ? "..." : ""
          }"`
        );
        console.log(
          `   New Value: "${group[0].newValue?.substring(0, 50)}${
            group[0].newValue?.length > 50 ? "..." : ""
          }"`
        );
        console.log(`   Created: ${group[0].createdDate}`);
        console.log(`   Keeping: ${group[0].uuid}`);

        // Keep the first one, mark the rest for deletion
        for (let i = 1; i < group.length; i++) {
          idsToDelete.push(group[i]._id);
          console.log(`   Deleting: ${group[i].uuid}`);
        }
        console.log("");
      }
    });

    console.log(`\n[SUMMARY] Summary:`);
    console.log(`   Total revisions: ${allRevisions.length}`);
    console.log(`   Unique groups: ${groupedRevisions.size}`);
    console.log(`   Duplicate groups: ${duplicateGroups}`);
    console.log(`   Affected records: ${affectedRecords.size}`);
    console.log(`   Total duplicates to remove: ${totalDuplicates}`);

    if (idsToDelete.length > 0) {
      console.log(
        `\n[WARNING] About to delete ${idsToDelete.length} duplicate entries.`
      );
      console.log(
        "   Press Ctrl+C to cancel, or waiting 3 seconds to proceed...\n"
      );

      // Wait 3 seconds
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Delete duplicates
      const result = await RevisionHistory.deleteMany({
        _id: { $in: idsToDelete },
      });

      console.log(
        `\n[SUCCESS] Successfully deleted ${result.deletedCount} duplicate revisions`
      );

      // Verify remaining count
      const remainingCount = await RevisionHistory.countDocuments({});
      console.log(`[INFO] Remaining total revisions: ${remainingCount}`);
      console.log(
        `[INFO] Saved space by removing ${totalDuplicates} duplicate entries\n`
      );
    } else {
      console.log("\n[SUCCESS] No duplicates found - data is clean!\n");
    }

    // Close connection
    await mongoose.connection.close();
    console.log("[INFO] MongoDB connection closed\n");
  } catch (error) {
    console.error("[ERROR] Error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

console.log(
  "\n[INFO] Running duplicate removal for ALL records in the database\n"
);
console.log(
  "[WARNING] WARNING: This will process the entire RevisionHistory collection!\n"
);

cleanupAllDuplicates();
