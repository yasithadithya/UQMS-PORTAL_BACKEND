import mongoose, { Schema, Document } from 'mongoose';

import { auditPlugin } from '../plugins/auditPlugin';
export interface IRequest extends Document {
  requestNumber: string;
  rfsDocNo?: string;
  jobNumber?: string;
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
  signedPdf?: IRequestDocument;
  status: 'active' | 'print' | 'reject' | 'success';
  source: 'staff' | 'web';
  approvalStatus: 'pending' | 'accepted' | 'rejected';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Supporting documents a client attaches to a survey request. */
export const REQUEST_DOCUMENT_TYPES = {
  'bill-of-sale': 'Bill of Sale / Proof of Ownership',
  'certificate-of-registry': 'Certificate of Registry',
  'ga-plan': 'General Arrangement Plan (GA)',
  'non-convention-request': 'Survey Request for Non-Convention Vessels',
  other: 'Other',
} as const;

export type RequestDocumentType = keyof typeof REQUEST_DOCUMENT_TYPES;

export const isRequestDocumentType = (value: unknown): value is RequestDocumentType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(REQUEST_DOCUMENT_TYPES, value);

export interface IRequestDocument extends Document {
  name: string;
  documentType?: RequestDocumentType;
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
    documentType: {
      type: String,
      enum: Object.keys(REQUEST_DOCUMENT_TYPES),
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
    // Assigned when the request becomes a job: on creation for staff requests,
    // on acceptance for website requests.
    jobNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
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
    signedPdf: {
      type: requestDocumentSchema,
      required: false,
    },
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: ['active', 'print', 'reject', 'success'],
      default: 'active',
      trim: true,
    },
    source: {
      type: String,
      enum: ['staff', 'web'],
      default: 'staff',
      trim: true,
    },
    // Website requests start as 'pending' and only reach the New Request list once accepted.
    // Records created before this field existed have no value and are treated as accepted.
    approvalStatus: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'accepted',
      trim: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
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

requestSchema.path('createdAt').immutable(false);

requestSchema.plugin(auditPlugin, { entityType: 'request' });

const Request = mongoose.model<IRequest>('Request', requestSchema);

export default Request;

/** Upload field names may be indexed ("ga-plan[0]"); returns the document type they carry, if any. */
export const documentTypeFromField = (fieldname: string): RequestDocumentType | undefined => {
  const base = fieldname.replace(/\[\d*\]$/, '');
  return isRequestDocumentType(base) ? base : undefined;
};
