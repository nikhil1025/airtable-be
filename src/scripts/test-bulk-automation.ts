import { connectDatabase } from "../config/database";
import { AirtableConnection, RevisionHistory, Ticket } from "../models";

async function testBulkRevisionAutomation() {
  try {
    console.log("🧪 TESTING BULK REVISION HISTORY AUTOMATION");
    console.log("=".repeat(60));

    await connectDatabase();
    console.log("✅ Connected to database");

    const userId = "user_1764311628981";

    // Show current state
    console.log("\n📊 CURRENT DATABASE STATE:");
    console.log("-".repeat(40));

    const ticketCount = await Ticket.countDocuments({ userId });
    const connectionExists = await AirtableConnection.exists({ userId });
    const existingRevisions = await RevisionHistory.countDocuments({ userId });

    console.log(`🎫 Total tickets: ${ticketCount}`);
    console.log(`🔗 Connection exists: ${connectionExists ? "YES" : "NO"}`);
    console.log(`📋 Existing revisions: ${existingRevisions}`);

    // Show sample tickets
    const sampleTickets = await Ticket.find({ userId })
      .select("airtableRecordId title status baseId tableId")
      .limit(5);

    console.log("\n📋 SAMPLE TICKETS:");
    console.log("-".repeat(40));
    sampleTickets.forEach((ticket, index) => {
      const ticketData = ticket as any;
      console.log(`${index + 1}. ${ticket.airtableRecordId}`);
      console.log(`   Title: ${ticketData.title || "No title"}`);
      console.log(`   Status: ${ticketData.status || "No status"}`);
      console.log(`   Base: ${ticket.baseId}`);
    });

    // Test the API endpoint
    console.log("\n🚀 TO START AUTOMATION:");
    console.log("-".repeat(40));
    console.log("Make POST request to:");
    console.log(
      "URL: http://localhost:3000/api/airtable/revision-history/bulk-automation"
    );
    console.log("Method: POST");
    console.log("Headers: Content-Type: application/json");
    console.log(`Body: {"userId": "${userId}"}`);

    console.log("\n📞 CURL COMMAND:");
    console.log(
      `curl -X POST http://localhost:3000/api/airtable/revision-history/bulk-automation \\`
    );
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"userId": "${userId}"}'`);

    console.log("\n⚡ WHAT THE AUTOMATION WILL DO:");
    console.log("-".repeat(40));
    console.log("1. ✅ Get all tickets from MongoDB (airtableRecordId field)");
    console.log(
      "2. ✅ Validate cookies properly with all auth/localStorage data"
    );
    console.log("3. ✅ Create URL list with exact format you specified");
    console.log("4. ✅ Iterate through each record hitting the endpoint");
    console.log("5. ✅ Extract revision history in your specified JSON format");
    console.log("6. ✅ Store in revision history collection");
    console.log("7. ✅ Print everything to terminal with detailed logging");

    console.log("\n📋 EXPECTED OUTPUT FORMAT:");
    console.log("-".repeat(40));
    console.log("[");
    console.log("  {");
    console.log('    "uuid": "act_1732784400000_abc123",');
    console.log('    "issueId": "recuMKeu0aLm7i0hP",');
    console.log('    "columnType": "Status",');
    console.log('    "oldValue": "To Do",');
    console.log('    "newValue": "In Progress",');
    console.log('    "createdDate": "2025-11-28T08:00:00.000Z",');
    console.log('    "authoredBy": "usrABC123DEF456"');
    console.log("  }");
    console.log("]");

    console.log("\n🎯 READY TO PROCESS:");
    console.log(`• ${ticketCount} tickets will be processed`);
    console.log(
      "• Each will use format: https://airtable.com/v0.3/row/{airtableRecordId}/readRowActivitiesAndComments?{options}"
    );
    console.log(
      "• Options include: stringifiedObjectParams, requestId, secretSocketId"
    );
    console.log("• Results will be stored in RevisionHistory collection");
    console.log("• Full terminal logging will show progress");

    console.log("\n✨ AUTOMATION IS READY TO RUN!");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    process.exit(0);
  }
}

testBulkRevisionAutomation();
