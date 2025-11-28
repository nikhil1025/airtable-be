import { connectDatabase } from "../config/database";
import { AirtableConnection } from "../models";
import { RevisionHistoryService } from "../services/RevisionHistoryService";

async function fetchRevisionHistoryForRecord() {
  try {
    console.log("🔍 FETCHING REVISION HISTORY FOR RECORD");
    console.log("=".repeat(50));

    await connectDatabase();
    console.log("✅ Database connected");

    // Target record from the URL
    const recordId = "recuMKeu0aLm7i0hP";
    const userId = "user_1764311628981";

    console.log(`🎯 Target Record: ${recordId}`);
    console.log(`👤 User ID: ${userId}`);

    // Check if we have valid cookies
    const connection = await AirtableConnection.findOne({ userId });
    if (!connection || !connection.cookies) {
      console.log("❌ No cookies found. Need to refresh cookies first.");
      console.log("\n💡 To refresh cookies, run:");
      console.log(
        "curl -X POST http://localhost:3000/api/airtable/cookies/auto-retrieve \\"
      );
      console.log('  -H "Content-Type: application/json" \\');
      console.log(
        '  -d \'{"email": "your-email", "password": "your-password", "userId": "user_1764311628981"}\''
      );
      return;
    }

    console.log("✅ Cookies found");
    console.log(`📅 Valid until: ${connection.cookiesValidUntil}`);

    // Create revision history service
    const revisionService = new RevisionHistoryService();

    console.log("\n🔄 Fetching revision history...");

    // Fetch revision history for the specific record
    const result = await revisionService.fetchRevisionHistoryAPI(
      userId,
      recordId
    );

    console.log("\n📊 RESULTS:");
    console.log("=".repeat(50));
    console.log(`Success: ${result.success}`);
    console.log(`Message: ${result.message}`);
    console.log(`Total Revisions: ${result.revisions.length}`);

    if (result.revisions.length > 0) {
      console.log("\n📋 REVISION HISTORY DATA:");
      console.log("=".repeat(50));

      // Format exactly as requested
      const formattedRevisions = result.revisions.map((revision) => ({
        uuid: revision.uuid,
        issueId: revision.issueId,
        columnType: revision.columnType,
        oldValue: revision.oldValue,
        newValue: revision.newValue,
        createdDate: revision.createdDate.toISOString(),
        authoredBy: revision.authoredBy,
      }));

      // Output in the exact JSON format requested
      console.log(JSON.stringify(formattedRevisions, null, 2));

      console.log("\n📈 SUMMARY:");
      console.log(
        `• Status Changes: ${
          formattedRevisions.filter((r) => r.columnType === "Status").length
        }`
      );
      console.log(
        `• Assignee Changes: ${
          formattedRevisions.filter((r) => r.columnType === "Assignee").length
        }`
      );
      console.log(
        `• Other Changes: ${
          formattedRevisions.filter(
            (r) => r.columnType !== "Status" && r.columnType !== "Assignee"
          ).length
        }`
      );
    } else {
      console.log("\n📭 No revision history found for this record.");
      console.log("\nPossible reasons:");
      console.log("• Record has no field changes");
      console.log("• Only Status/Assignee changes are tracked");
      console.log("• User lacks permission to view history");
    }
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);

    if (error.message.includes("401") || error.message.includes("403")) {
      console.log("\n🔐 Authentication Error - Cookies expired or invalid");
      console.log("💡 Please refresh cookies using the automated system");
    } else if (error.message.includes("404")) {
      console.log(
        "\n🔍 Record Not Found - Check if record exists and is accessible"
      );
    }
  } finally {
    process.exit(0);
  }
}

fetchRevisionHistoryForRecord();
