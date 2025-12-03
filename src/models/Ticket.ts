import mongoose, { Document, Schema } from "mongoose";
import { TicketDocument } from "../types";

export interface ITicket extends TicketDocument, Document {}

const TicketSchema: Schema = new Schema(
  {
    airtableRecordId: {
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
    tableId: {
      type: String,
      required: true,
      index: true,
    },
    fields: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    rowId: {
      type: String,
      required: true,
    },
    createdTime: {
      type: Date,
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

TicketSchema.index({ userId: 1, baseId: 1 });
TicketSchema.index({ userId: 1, tableId: 1 });
TicketSchema.index({ userId: 1, baseId: 1, tableId: 1 });

export default mongoose.model<ITicket>("Ticket", TicketSchema);
