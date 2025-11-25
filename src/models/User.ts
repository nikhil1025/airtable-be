import mongoose, { Document, Schema } from "mongoose";
import { UserDocument } from "../types";

export interface IUser extends UserDocument, Document {}

const UserSchema: Schema = new Schema(
  {
    airtableUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: "",
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

// Compound index
UserSchema.index({ userId: 1, airtableUserId: 1 });

export default mongoose.model<IUser>("User", UserSchema);
