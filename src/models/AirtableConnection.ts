import mongoose, { Document, Schema } from "mongoose";
import { AirtableConnectionDocument } from "../types";

export interface IAirtableConnection
  extends AirtableConnectionDocument,
    Document {}

const AirtableConnectionSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // OAuth tokens (from proper OAuth flow)
    accessToken: {
      type: String,
      default: null,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    // Scraped tokens (from cookie scraping - separate field to avoid conflicts)
    scrapedAccessToken: {
      type: String,
      default: null,
    },
    cookies: {
      type: String,
      default: null,
    },
    localStorage: {
      type: String,
      default: null,
    },
    cookiesValidUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAirtableConnection>(
  "AirtableConnection",
  AirtableConnectionSchema
);
