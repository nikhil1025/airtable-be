import mongoose from "mongoose";
import AirtableConnection from "../models/AirtableConnection";
import { decrypt } from "../utils/encryption";

const USER_ID = "user_1764744026062_scijlqqt6";

async function debugCookies() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/airtable"
    );
    console.log("✅ Connected to MongoDB\n");

    const connection = await AirtableConnection.findOne({ userId: USER_ID });

    if (!connection) {
      console.log("❌ No connection found for user");
      return;
    }

    console.log("📊 COOKIE ANALYSIS");
    console.log("=".repeat(80));

    // Decrypt cookies
    const cookiesArray = connection.cookies
      ? JSON.parse(decrypt(connection.cookies))
      : [];

    console.log(`\n✅ Total cookies stored: ${cookiesArray.length}\n`);

    // Group by domain
    const byDomain: Record<string, any[]> = {};
    cookiesArray.forEach((cookie: any) => {
      const domain = cookie.domain || "unknown";
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(cookie);
    });

    console.log("📍 Cookies by domain:");
    console.log("-".repeat(80));
    Object.entries(byDomain).forEach(([domain, cookies]) => {
      console.log(`\n${domain} (${cookies.length} cookies):`);
      cookies.forEach((c: any) => {
        console.log(`  - ${c.name}`);
      });
    });

    // Check for critical Airtable cookies
    console.log("\n\n🔑 CRITICAL AIRTABLE COOKIES:");
    console.log("-".repeat(80));
    const criticalCookies = [
      "__Host-airtable-session",
      "__Host-airtable-session.sig",
      "brw",
      "brwConsent",
      "AWSALBTG",
      "AWSALBTGCORS",
      "AWSALBAPP-0",
      "mbpg",
      "mbpg.sig",
      "OptanonConsent",
      "localePref",
      "rts",
      "mv",
    ];

    criticalCookies.forEach((name) => {
      const found = cookiesArray.find((c: any) => c.name === name);
      console.log(`${found ? "✅" : "❌"} ${name}`);
    });

    // Check for tracking/analytics cookies
    console.log("\n\n📊 TRACKING/ANALYTICS COOKIES:");
    console.log("-".repeat(80));
    const trackingPrefixes = [
      "_ga",
      "_fb",
      "_mkto",
      "_gcl",
      "_px",
      "_clck",
      "_uetvid",
      "__q_state",
      "mf_user",
      "__stripe",
    ];

    const trackingCookies = cookiesArray.filter((c: any) =>
      trackingPrefixes.some((prefix) => c.name.startsWith(prefix))
    );

    console.log(`Found ${trackingCookies.length} tracking cookies:`);
    trackingCookies.forEach((c: any) => {
      console.log(`  ✅ ${c.name} (${c.domain})`);
    });

    // List ALL cookie names
    console.log("\n\n📋 ALL COOKIE NAMES:");
    console.log("-".repeat(80));
    cookiesArray.forEach((c: any, i: number) => {
      console.log(`${i + 1}. ${c.name} (${c.domain})`);
    });

    console.log("\n" + "=".repeat(80));
    console.log(`\n🎯 TOTAL: ${cookiesArray.length} cookies\n`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

debugCookies();
