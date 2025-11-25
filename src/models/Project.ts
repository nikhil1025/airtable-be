import mongoose, { Document, Schema } from "mongoose";
import { ProjectDocument } from "../types";

export interface IProject extends ProjectDocument, Document {}

const ProjectSchema: Schema = new Schema(
  {
    airtableBaseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    permissionLevel: {
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

// Compound index for userId and airtableBaseId
ProjectSchema.index({ userId: 1, airtableBaseId: 1 });

export default mongoose.model<IProject>("Project", ProjectSchema);
