import { connectDatabase } from "../config/database";
import { AirtableConnection, Ticket } from "../models";


async function setupTestData() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🔧 SETTING UP TEST DATA");
    console.log("=".repeat(70));

    await connectDatabase();
    console.log("✅ Connected to MongoDB");

    const TEST_USER_ID = "user_1764525443009";

    // Step 1: Create AirtableConnection (if not exists)
    console.log("\n📦 Step 1: Creating AirtableConnection...");

    let connection = await AirtableConnection.findOne({ userId: TEST_USER_ID });

    if (connection) {
      console.log("⚠️  Connection already exists for this user");
      console.log(`   User ID: ${TEST_USER_ID}`);
      console.log(`   Has Cookies: ${connection.cookies ? "YES" : "NO"}`);
      console.log(
        `   Has OAuth Tokens: ${connection.accessToken ? "YES" : "NO"}`
      );
    } else {
      connection = await AirtableConnection.create({
        userId: TEST_USER_ID,
        cookies: null,
        accessToken: null,
        refreshToken: null,
        cookiesValidUntil: null,
      });
      console.log("✅ Created new AirtableConnection");
      console.log(`   User ID: ${TEST_USER_ID}`);
    }

    // Step 2: Check for existing tickets
    console.log("\n🎫 Step 2: Checking for tickets...");

    const existingTickets = await Ticket.countDocuments({
      userId: TEST_USER_ID,
    });
    console.log(`   Found ${existingTickets} tickets for this user`);

    if (existingTickets === 0) {
      console.log("\n⚠️  NO TICKETS FOUND!");
      console.log("\nYou have two options:");
      console.log("\n📋 OPTION 1: Use Different Test User (Recommended)");
      console.log("   Check which users have data:");

      const usersWithTickets = await Ticket.distinct("userId");
      console.log(`\n   Users with tickets: ${usersWithTickets.length}`);

      if (usersWithTickets.length > 0) {
        console.log("\n   Available users:");
        for (const userId of usersWithTickets.slice(0, 5)) {
          const ticketCount = await Ticket.countDocuments({ userId });
          const conn = await AirtableConnection.findOne({ userId });
          console.log(`   • ${userId}`);
          console.log(`     - Tickets: ${ticketCount}`);
          console.log(`     - Has Cookies: ${conn?.cookies ? "YES" : "NO"}`);
          console.log(`     - Has OAuth: ${conn?.accessToken ? "YES" : "NO"}`);
        }

        console.log(
          "\n   💡 To use a different user, update the TEST_USER_ID in:"
        );
        console.log("      src/scripts/test-revision-scraping.ts (line 565)");
      }

      console.log("\n📋 OPTION 2: Sync Data for This User");
      console.log("   First, authenticate and get OAuth tokens:");
      console.log(
        `   1. Visit: http://localhost:3000/api/airtable/oauth/authorize?userId=${TEST_USER_ID}`
      );
      console.log("   2. Complete OAuth flow");
      console.log("   3. Then sync data:");
      console.log(
        `\n   curl -X POST 'http://localhost:3000/api/airtable/data/sync-fresh?userId=${TEST_USER_ID}' \\`
      );
      console.log(`     -H 'Content-Type: application/json' \\`);
      console.log(
        `     -d '{"accessToken":"your-token","refreshToken":"your-refresh-token"}'`
      );
    } else {
      console.log("\n✅ Tickets found! Showing sample:");
      const sampleTicket = await Ticket.findOne({ userId: TEST_USER_ID });
      if (sampleTicket) {
        console.log(`   Record ID: ${sampleTicket.airtableRecordId}`);
        console.log(`   Row ID: ${sampleTicket.rowId}`);
        console.log(`   Base ID: ${sampleTicket.baseId}`);
        console.log(`   Table ID: ${sampleTicket.tableId}`);
      }
    }

    // Step 3: Check cookie status
    console.log("\n🍪 Step 3: Cookie Status...");

    if (!connection.cookies) {
      console.log("❌ No cookies found!");
      console.log("\n💡 To get cookies, you have two options:");
      console.log("\n   OPTION A: Auto-retrieve (requires credentials):");
      console.log(
        `   curl -X POST 'http://localhost:3000/api/airtable/cookies/auto-retrieve' \\`
      );
      console.log(`     -H 'Content-Type: application/json' \\`);
      console.log(
        `     -d '{"userId":"${TEST_USER_ID}","email":"your-email@example.com","password":"your-password"}'`
      );

      console.log("\n   OPTION B: Manual extraction:");
      console.log(
        `   curl -X POST 'http://localhost:3000/api/airtable/cookies/set' \\`
      );
      console.log(`     -H 'Content-Type: application/json' \\`);
      console.log(
        `     -d '{"userId":"${TEST_USER_ID}","cookies":"paste-your-cookies-here"}'`
      );
    } else {
      const isExpired =
        connection.cookiesValidUntil &&
        new Date(connection.cookiesValidUntil) < new Date();

      if (isExpired) {
        console.log("⚠️  Cookies exist but have EXPIRED!");
        console.log(`   Valid until: ${connection.cookiesValidUntil}`);
        console.log("   Need to refresh cookies (see options above)");
      } else {
        console.log("✅ Valid cookies found!");
        console.log(
          `   Valid until: ${connection.cookiesValidUntil || "Unknown"}`
        );
      }
    }

    // Final summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 SUMMARY");
    console.log("=".repeat(70));
    console.log(`User ID: ${TEST_USER_ID}`);
    console.log(`Connection: ${connection ? "EXISTS" : "NOT FOUND"}`);
    console.log(`Cookies: ${connection?.cookies ? "PRESENT" : "MISSING"}`);
    console.log(`Tickets: ${existingTickets} found`);

    const canRunTest = connection?.cookies && existingTickets > 0;

    if (canRunTest) {
      console.log("\n✅ READY TO RUN TEST!");
      console.log("   Execute: npm run test:revision-scraping");
    } else {
      console.log("\n⚠️  NOT READY - Missing:");
      if (!connection?.cookies) console.log("   • Cookies");
      if (existingTickets === 0) console.log("   • Tickets data");
    }

    console.log("\n");
    process.exit(0);
  } catch (error) {
    console.error("\n💥 Error setting up test data:", error);
    process.exit(1);
  }
}

// Run setup
setupTestData();
