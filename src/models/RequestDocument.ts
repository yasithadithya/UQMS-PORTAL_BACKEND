import mongoose, { Schema, Document } from 'mongoose';

export interface IRequestSurveyDocument extends Document {
  requestId: mongoose.Types.ObjectId;
  requestNumber: string;
  vesselName: string;
  key: string;
  url?: string;
  bucket: string;
  mimeType: string;
  filename: string;
  size?: number;
  etag?: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const requestDocumentSchema: Schema = new Schema(
  {
    requestId: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Request ID is required'],
      unique: true,
      index: true,
    },
    requestNumber: {
      type: String,
      required: [true, 'Request number is required'],
      trim: true,
    },
    vesselName: {
      type: String,
      required: [true, 'Vessel name is required'],
      trim: true,
    },
    key: {
      type: String,
      required: [true, 'File key is required'],
      unique: true,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    bucket: {
      type: String,
      required: [true, 'Bucket is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      default: 'application/pdf',
      trim: true,
    },
    filename: {
      type: String,
      required: [true, 'Filename is required'],
      trim: true,
    },
    size: {
      type: Number,
      min: 0,
    },
    etag: {
      type: String,
      trim: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const RequestDocument = mongoose.model<IRequestSurveyDocument>('RequestDocument', requestDocumentSchema);

export default RequestDocument;