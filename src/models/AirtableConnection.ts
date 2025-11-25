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
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    cookies: {
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
