import { connectDatabase } from "../config/database";
import { RevisionHistoryFetchService } from "../services/RevisionHistoryFetchService";

/**
 * Standalone script to test revision history fetching
 * This will show all logs in terminal
 */

async function main() {
  try {
    const userId = process.argv[2] || "user_1764525443009";

    console.log("\n" + "=".repeat(70));
    console.log(" STANDALONE REVISION HISTORY FETCH TEST");
    console.log("=".repeat(70));
    console.log(`👤 User ID: ${userId}`);
    console.log(` Started at: ${new Date().toISOString()}`);
    console.log("=".repeat(70) + "\n");

    // Connect to database
    await connectDatabase();

    // Create service and fetch
    const service = new RevisionHistoryFetchService(userId);
    const revisions = await service.fetchAndStoreRevisionHistories();

    console.log("\n" + "=".repeat(70));
    console.log(" FINAL SUMMARY");
    console.log("=".repeat(70));
    console.log(` Total Revisions Stored: ${revisions.length}`);
    console.log(` Completed at: ${new Date().toISOString()}`);
    console.log("=".repeat(70) + "\n");

    // Display results like the parallel script
    const { RevisionHistory } = await import("../models");
    const allUserRevisions = await RevisionHistory.find({ userId })
      .sort({ createdDate: -1 })
      .lean();

    // Group by issueId
    const groupedByIssue: { [key: string]: any[] } = {};
    allUserRevisions.forEach((rev: any) => {
      if (!groupedByIssue[rev.issueId]) {
        groupedByIssue[rev.issueId] = [];
      }
      groupedByIssue[rev.issueId].push({
        uuid: rev.uuid,
        issueId: rev.issueId,
        columnType: rev.columnType,
        oldValue: rev.oldValue,
        newValue: rev.newValue,
        createdDate: rev.createdDate,
        authoredBy: rev.authoredBy,
      });
    });

    console.log("\n" + "=".repeat(70));
    console.log(" Detailed Results");
    console.log("=".repeat(70) + "\n");

    let counter = 1;
    for (const [issueId, revisionItems] of Object.entries(groupedByIssue)) {
      if (revisionItems.length > 0) {
        console.log(
          `${counter}. ${issueId} - ${JSON.stringify(revisionItems)}`
        );
      } else {
        console.log(`${counter}. ${issueId} - null`);
      }
      counter++;
    }

    console.log("\n" + "=".repeat(70));
    console.log(" SCRAPING COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(70) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n💥 ERROR:", error);
    process.exit(1);
  }
}

main();
