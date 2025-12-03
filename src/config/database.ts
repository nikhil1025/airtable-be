import mongoose from "mongoose";
import { logger } from "../utils/errors";
import config from "./index";

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(config.mongodb.uri);

    logger.info("MongoDB connected successfully", {
      uri: config.mongodb.uri.replace(/\/\/.*@/, "//***@"),
    });

    mongoose.connection.on("error", (error) => {
      logger.error("MongoDB connection error", error);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected");
    });
  } catch (error) {
    logger.error("Failed to connect to MongoDB", error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected successfully");
  } catch (error) {
    logger.error("Failed to disconnect from MongoDB", error);
    throw error;
  }
}

export default {
  connectDatabase,
  disconnectDatabase,
};
