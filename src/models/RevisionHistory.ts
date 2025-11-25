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
      enum: ["Status", "Assignee"],
    },
    oldValue: {
      type: String,
      required: true,
    },
    newValue: {
      type: String,
      required: true,
    },
    createdDate: {
      type: Date,
      required: true,
    },
    authoredBy: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
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

export default mongoose.model<IRevisionHistory>(
  "RevisionHistory",
  RevisionHistorySchema
);
