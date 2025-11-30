import mongoose from "mongoose";
import config from "../config";
import { AirtableConnection } from "../models";
import { logger } from "../utils/errors";

/**
 * Script to clear corrupted OAuth tokens from database
 * Run this if you're getting "Decryption failed: Invalid encrypted text format" errors
 */
async function clearCorruptedTokens() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodb.uri);
    logger.info("Connected to MongoDB");

    // Clear all OAuth tokens (users will need to re-authenticate)
    const result = await AirtableConnection.updateMany(
      {},
      {
        $unset: {
          accessToken: "",
          refreshToken: "",
        },
      }
    );

    logger.info(`Cleared tokens from ${result.modifiedCount} connections`);
    logger.info("Users will need to re-authenticate via OAuth");

    process.exit(0);
  } catch (error) {
    logger.error("Failed to clear tokens", error);
    process.exit(1);
  }
}

clearCorruptedTokens();
