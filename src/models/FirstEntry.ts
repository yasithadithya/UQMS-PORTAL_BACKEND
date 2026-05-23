import mongoose, { Schema, Document } from 'mongoose';

export interface IFirstEntry extends Document {
  request: mongoose.Types.ObjectId;
  vessel: mongoose.Types.ObjectId;
  isQuoted: boolean;
  quotationNumber?: string;
  quotationComments?: string;
  scheduleII?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const firstEntrySchema: Schema = new Schema(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Request reference is required'],
    },
    vessel: {
      type: Schema.Types.ObjectId,
      ref: 'Vessel',
      required: [true, 'Vessel reference is required'],
    },
    isQuoted: {
      type: Boolean,
      default: false,
    },
    quotationNumber: {
      type: String,
      trim: true,
    },
    quotationComments: {
      type: String,
      trim: true,
    },
    scheduleII: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduleII',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

const FirstEntry = mongoose.model<IFirstEntry>('FirstEntry', firstEntrySchema);

export default FirstEntry;
