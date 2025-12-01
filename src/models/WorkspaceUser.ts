import mongoose, { Document, Schema } from "mongoose";

export interface IWorkspaceUser extends Document {
  userId: string; // The Airtable user who owns this connection
  airtableUserId: string; // The workspace user's ID from Airtable
  email: string;
  name?: string;
  state?: string; // e.g., "active", "pending", etc.
  createdTime?: string;
  lastActivityTime?: string;
  invitedToAirtableByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceUserSchema = new Schema<IWorkspaceUser>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    airtableUserId: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
    },
    name: {
      type: String,
    },
    state: {
      type: String,
    },
    createdTime: {
      type: String,
    },
    lastActivityTime: {
      type: String,
    },
    invitedToAirtableByUserId: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "workspaceUsers",
  }
);

// Compound index for unique user per workspace
WorkspaceUserSchema.index({ userId: 1, airtableUserId: 1 }, { unique: true });

export const WorkspaceUser = mongoose.model<IWorkspaceUser>(
  "WorkspaceUser",
  WorkspaceUserSchema
);
