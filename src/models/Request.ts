import mongoose, { Schema, Document } from 'mongoose';

export interface IRequest extends Document {
  requestNumber: string;
  rfsDocNo?: string;
  vesselCode?: string;
  uqmsNumber?: string;
  imoNumber?: string;
  mmsiNumber?: string;
  vesselName: string;
  companyName: string;
  contactPersonName: string;
  contactPersonNumber: string;
  registerdAddress?: string;
  invoicingAddress: string;
  companyEmail: string;
  sector: 'marine' | 'industrial';
  vesselType: mongoose.Types.ObjectId;
  areaOfOperation: mongoose.Types.ObjectId;
  surveyTypes: mongoose.Types.ObjectId[];
  documents: IRequestDocument[];
  status: 'active' | 'print' | 'reject';
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRequestDocument extends Document {
  name: string;
  key: string;
  url?: string;
  contentType?: string;
  size?: number;
  uploadedAt: Date;
}

const requestDocumentSchema = new Schema(
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

const requestSchema: Schema = new Schema(
  {
    requestNumber: {
      type: String,
      required: [true, 'Request number is required'],
      unique: true,
      trim: true,
    },
    rfsDocNo: {
      type: String,
      trim: true,
    },
    vesselCode: {
      type: String,
      trim: true,
    },
    uqmsNumber: {
      type: String,
      trim: true,
    },
    imoNumber: {
      type: String,
      trim: true,
    },
    mmsiNumber: {
      type: String,
      trim: true,
    },
    vesselName: {
      type: String,
      trim: true,
      required: [true, 'Vessel name is required'],
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    contactPersonName: {
      type: String,
      required: [true, 'Contact person name is required'],
      trim: true,
    },
    contactPersonNumber: {
      type: String,
      required: [true, 'Contact person number is required'],
      trim: true,
    },
    registerdAddress: {
      type: String,
      trim: true,
    },
    invoicingAddress: {
      type: String,
      trim: true,
      required: [true, 'Invoicing address is required'],
    },
    companyEmail: {
      type: String,
      trim: true,
      required: [true, 'Company email is required'],
    },
    sector: {
      type: String,
      required: [true, 'Sector is required'],
      enum: ['marine', 'industrial'],
      trim: true,
    },
    vesselType: {
      type: Schema.Types.ObjectId,
      ref: 'VesselType',
      required: [true, 'Vessel type is required'],
    },
    areaOfOperation: {
      type: Schema.Types.ObjectId,
      ref: 'AreaOfOperation',
      required: [true, 'Area of operation is required'],
    },
    surveyTypes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'SurveyType',
        required: [true, 'Survey type is required'],
      },
    ],
    documents: {
      type: [requestDocumentSchema],
      default: [],
    },
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: ['active', 'print', 'reject', 'success'],
      default: 'active',
      trim: true,
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

const Request = mongoose.model<IRequest>('Request', requestSchema);

export default Request;
