import mongoose, { Document, Schema } from "mongoose";
import { RevisionHistoryDocument } from "../types";

export interface IRevisionHistory extends RevisionHistoryDocument, Document {}

const RevisionHistorySchema: Schema = new Schema(
  {
    uuid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    issueId: {
      type: String,
      required: true,
      index: true,
    },
    columnType: {
      type: String,
      required: true,
      // Removed enum restriction to allow all activity types
    },
    oldValue: {
      type: String,
      required: false, // Optional since some activities don't have old values
      default: "",
    },
    newValue: {
      type: String,
      required: false, // Optional since some activities don't have new values
      default: "",
    },
    createdDate: {
      type: Date,
      required: true,
    },
    authoredBy: {
      type: String,
      required: true,
    },
    authorName: {
      type: String,
      required: false,
    },
    baseId: {
      type: String,
      required: true,
      index: true,
    },
    tableId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    rawData: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
RevisionHistorySchema.index({ userId: 1, issueId: 1 });
RevisionHistorySchema.index({ userId: 1, columnType: 1 });
RevisionHistorySchema.index({ userId: 1, issueId: 1, createdDate: -1 });
RevisionHistorySchema.index({ baseId: 1, tableId: 1 });

export default mongoose.model<IRevisionHistory>(
  "RevisionHistory",
  RevisionHistorySchema
);
