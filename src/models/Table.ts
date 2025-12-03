import mongoose, { Document, Schema } from "mongoose";
import { TableDocument } from "../types";

export interface ITable extends TableDocument, Document {}

const TableSchema: Schema = new Schema(
  {
    airtableTableId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    baseId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    fields: {
      type: Schema.Types.Mixed,
      required: true,
      default: [],
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

TableSchema.index({ userId: 1, baseId: 1 });
TableSchema.index({ userId: 1, airtableTableId: 1 });

export default mongoose.model<ITable>("Table", TableSchema);
