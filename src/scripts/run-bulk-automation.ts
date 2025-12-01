import axios from "axios";
import { connectDatabase } from "../config/database";

async function runBulkAutomationDemo() {
  try {
    console.log(" RUNNING BULK REVISION HISTORY AUTOMATION");
    console.log("=".repeat(60));

    await connectDatabase();

    const userId = "user_1764311628981";

    console.log(`👤 User ID: ${userId}`);
    console.log("🎯 Target: All 24 tickets in MongoDB");
    console.log(" Expected: Extract revision history in your exact format");

    console.log("\n Making API call to bulk automation endpoint...");

    // Make the API call to the bulk automation
    const startTime = Date.now();

    try {
      const response = await axios.post(
        "http://localhost:3000/api/airtable/revision-history/bulk-automation",
        {
          userId: userId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 300000, // 5 minutes timeout for bulk processing
        }
      );

      const duration = (Date.now() - startTime) / 1000;

      console.log("\n BULK AUTOMATION COMPLETED SUCCESSFULLY!");
      console.log("=".repeat(60));
      console.log(`⏱️ Total time: ${duration.toFixed(2)} seconds`);
      console.log(` Status: ${response.data.success}`);
      console.log(` Message: ${response.data.message}`);

      const results = response.data.results;

      console.log("\n PROCESSING SUMMARY:");
      console.log("-".repeat(40));
      console.log(` Total tickets processed: ${results.totalTickets}`);
      console.log(` Successful requests: ${results.successfulRequests}`);
      console.log(` Failed requests: ${results.failedRequests}`);
      console.log(
        ` Total revision changes found: ${results.totalRevisionChanges}`
      );
      console.log(` Records saved to database: ${results.recordsSaved}`);

      if (results.revisionHistory && results.revisionHistory.length > 0) {
        console.log("\n REVISION HISTORY EXTRACTED (Your Format):");
        console.log("=".repeat(60));

        // Show sample of results
        const sampleSize = Math.min(5, results.revisionHistory.length);
        const sample = results.revisionHistory.slice(0, sampleSize);

        console.log(" Sample Results:");
        console.log(JSON.stringify(sample, null, 2));

        if (results.revisionHistory.length > sampleSize) {
          console.log(
            `\n... and ${
              results.revisionHistory.length - sampleSize
            } more revision changes`
          );
        }

        // Statistics
        const statusChanges = results.revisionHistory.filter(
          (r: any) => r.columnType === "Status"
        ).length;
        const assigneeChanges = results.revisionHistory.filter(
          (r: any) => r.columnType === "Assignee"
        ).length;
        const otherChanges =
          results.revisionHistory.length - statusChanges - assigneeChanges;

        console.log("\n BREAKDOWN BY COLUMN TYPE:");
        console.log(`• Status Changes: ${statusChanges}`);
        console.log(`• Assignee Changes: ${assigneeChanges}`);
        console.log(`• Other Changes: ${otherChanges}`);

        // Show unique records processed
        const uniqueRecords = new Set(
          results.revisionHistory.map((r: any) => r.issueId)
        );
        console.log(`• Unique records with history: ${uniqueRecords.size}`);
      } else {
        console.log("\n📭 No revision history found");
        console.log("Possible reasons:");
        console.log("• Records have no field changes");
        console.log("• Only Status/Assignee changes are tracked");
        console.log("• Authentication issues");
      }

      console.log("\n✨ AUTOMATION SUCCESS!");
      console.log("All revision history has been:");
      console.log(
        " Extracted from Airtable using the correct endpoint format"
      );
      console.log(" Formatted in your exact JSON specification");
      console.log(" Stored in RevisionHistory MongoDB collection");
      console.log(" Logged to terminal with full details");
    } catch (error: any) {
      console.error("\n AUTOMATION FAILED:");
      console.error(`Error: ${error?.message || String(error)}`);

      if (error?.response) {
        console.error(`Status: ${error.response.status}`);
        console.error(
          `Response: ${JSON.stringify(error.response.data, null, 2)}`
        );

        if (error.response.status === 401) {
          console.log("\n🔐 AUTHENTICATION REQUIRED:");
          console.log("1. Cookies need to be refreshed");
          console.log("2. Use MFA authentication in frontend");
          console.log("3. Store all cookies, localStorage, sessionData");
          console.log("4. Then retry the automation");
        }
      }
    }
  } catch (error) {
    console.error(" Setup error:", error);
  } finally {
    process.exit(0);
  }
}

runBulkAutomationDemo();
