import mongoose, { Schema, Document } from 'mongoose';

export interface IScheduleIIDocument extends Document {
  name: string;
  key: string;
  url?: string;
  contentType?: string;
  size?: number;
  uploadedAt: Date;
}

const scheduleIIDocumentSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Document name is required'],
      trim: true,
    },
    key: {
      type: String,
      required: [true, 'Document key is required'],
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    contentType: {
      type: String,
      trim: true,
    },
    size: {
      type: Number,
      min: 0,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

export interface IScheduleII extends Document {
  firstEntry: mongoose.Types.ObjectId;
  documents: IScheduleIIDocument[];
  status: string;
  emailSent?: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const scheduleIISchema: Schema = new Schema(
  {
    firstEntry: {
      type: Schema.Types.ObjectId,
      ref: 'FirstEntry',
      required: [true, 'First entry reference is required'],
    },
    documents: {
      type: [scheduleIIDocumentSchema],
      default: [],
    },
    status: {
      type: String,
      trim: true,
      default: 'pending',
    },
    emailSent: {
      type: Boolean,
      default: false,
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

const ScheduleII = mongoose.model<IScheduleII>('ScheduleII', scheduleIISchema);

export default ScheduleII;
