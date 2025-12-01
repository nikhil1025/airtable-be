import dotenv from "dotenv";
import mongoose from "mongoose";
import { RevisionHistory } from "../models";

dotenv.config();

/**
 * Script to remove duplicate revision history entries
 * Keeps one entry and removes duplicates based on:
 * - issueId (record ID)
 * - newValue
 * - oldValue
 * - createdDate
 */

async function removeDuplicateRevisions(recordId?: string) {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/airtable-integration";
    await mongoose.connect(mongoUri);
    console.log("[INFO] Connected to MongoDB");

    // Build query
    const query = recordId ? { issueId: recordId } : {};

    console.log(
      `\n[INFO] Searching for revisions${
        recordId ? ` for record: ${recordId}` : ""
      }...`
    );

    // Get all revisions for the record
    const revisions = await RevisionHistory.find(query).sort({
      createdDate: 1,
    });
    console.log(`[INFO] Found ${revisions.length} total revisions`);

    if (revisions.length === 0) {
      console.log("[WARNING] No revisions found");
      await mongoose.connection.close();
      return;
    }

    // Group by issueId + newValue + oldValue + createdDate
    const groupedRevisions = new Map<string, any[]>();

    revisions.forEach((revision) => {
      const key = `${revision.issueId}|${revision.newValue}|${
        revision.oldValue
      }|${revision.createdDate.toISOString()}`;

      if (!groupedRevisions.has(key)) {
        groupedRevisions.set(key, []);
      }
      groupedRevisions.get(key)!.push(revision);
    });

    console.log(
      `\n[INFO] Found ${groupedRevisions.size} unique revision groups`
    );

    let totalDuplicates = 0;
    let duplicateGroups = 0;
    const idsToDelete: string[] = [];

    // Find duplicates
    groupedRevisions.forEach((group) => {
      if (group.length > 1) {
        duplicateGroups++;
        const duplicateCount = group.length - 1;
        totalDuplicates += duplicateCount;

        console.log(`\n[DUPLICATE] Duplicate group (${group.length} entries):`);
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
      }
    });

    console.log(`\n[SUMMARY] Summary:`);
    console.log(`   Total revisions: ${revisions.length}`);
    console.log(`   Unique groups: ${groupedRevisions.size}`);
    console.log(`   Duplicate groups: ${duplicateGroups}`);
    console.log(`   Total duplicates to remove: ${totalDuplicates}`);

    if (idsToDelete.length > 0) {
      // Delete duplicates
      const result = await RevisionHistory.deleteMany({
        _id: { $in: idsToDelete },
      });

      console.log(
        `\n[SUCCESS] Successfully deleted ${result.deletedCount} duplicate revisions`
      );

      // Verify remaining count
      const remainingCount = await RevisionHistory.countDocuments(query);
      console.log(
        `[INFO] Remaining revisions${
          recordId ? ` for record ${recordId}` : ""
        }: ${remainingCount}`
      );
    } else {
      console.log("\n[SUCCESS] No duplicates found - data is clean!");
    }

    // Close connection
    await mongoose.connection.close();
    console.log("\n[INFO] MongoDB connection closed");
  } catch (error) {
    console.error("[ERROR] Error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Get record ID from command line argument
const recordId = process.argv[2];

if (recordId) {
  console.log(
    `\n[INFO] Running duplicate removal for specific record: ${recordId}\n`
  );
} else {
  console.log("\n[INFO] Running duplicate removal for ALL records\n");
  console.log(
    "[TIP] Tip: Pass a record ID as argument to process only that record"
  );
  console.log(
    "   Example: ts-node src/scripts/remove-duplicate-revisions.ts recrSmRw91cnPFbvi\n"
  );
}

removeDuplicateRevisions(recordId);
