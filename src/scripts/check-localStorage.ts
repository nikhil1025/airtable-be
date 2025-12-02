import mongoose from "mongoose";
import { decrypt } from "../utils/encryption";

const USER_ID = "user_1764605048688_4olm46hqw";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/airtable-integration";

async function checkLocalStorage() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log(" CHECKING LOCALSTORAGE FOR ACCESS TOKEN");
    console.log("=".repeat(70) + "\n");

    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    const connection = await mongoose.connection
      .db!.collection("airtableconnections")
      .findOne({ userId: USER_ID });

    if (!connection) {
      console.log("✗ No connection found");
      process.exit(1);
    }

    console.log("✓ Found connection");

    if (!connection.localStorage) {
      console.log("✗ No localStorage found");
      process.exit(1);
    }

    const decryptedLocalStorage = decrypt(connection.localStorage);
    console.log(
      `✓ Decrypted localStorage (${decryptedLocalStorage.length} chars)\n`
    );

    // Parse localStorage JSON
    const localStorageData = JSON.parse(decryptedLocalStorage);

    console.log("localStorage keys:");
    Object.keys(localStorageData).forEach((key) => {
      const value = localStorageData[key];
      if (typeof value === "string" && value.length > 100) {
        console.log(
          `  - ${key}: ${value.substring(0, 50)}... (${value.length} chars)`
        );
      } else {
        console.log(`  - ${key}:`, value);
      }
    });

    // Look for access token patterns
    const possibleTokenKeys = Object.keys(localStorageData).filter(
      (key) =>
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("auth") ||
        key.toLowerCase().includes("access")
    );

    console.log("\nPossible token keys:", possibleTokenKeys);

    if (possibleTokenKeys.length > 0) {
      possibleTokenKeys.forEach((key) => {
        const value = localStorageData[key];
        console.log(`\n${key}:`);
        if (typeof value === "string") {
          console.log(`  Type: string`);
          console.log(`  Length: ${value.length}`);
          console.log(`  Starts with: ${value.substring(0, 50)}`);
        } else {
          console.log(`  Type: ${typeof value}`);
          console.log(`  Value:`, JSON.stringify(value, null, 2));
        }
      });
    }

    await mongoose.disconnect();
    console.log("\n✓ Done\n");
    process.exit(0);
  } catch (error: any) {
    console.log("\n" + "=".repeat(70));
    console.log(" ERROR ✗");
    console.log("=".repeat(70));
    console.log("Message:", error.message);
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    }
    console.log("=".repeat(70) + "\n");
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkLocalStorage();
