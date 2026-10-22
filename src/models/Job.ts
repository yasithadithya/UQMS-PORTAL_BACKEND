import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin } from '../plugins/auditPlugin';
import { MAIN_SURVEY_TYPES, MainSurveyType, Sector } from '../config/surveyCategories';

/**
 * V2: one Job per accepted request. Created at Surveyor Allocation and carried through booking,
 * reporting, surveyor review, certificate signing and manager authorization.
 */
export const JOB_STATUSES = [
  'allocated', // surveyor allocated, waiting for survey booking
  'booked', // survey booking saved
  'in-progress', // reporting workspace in use (also the state after any rejection)
  'submitted', // assistant surveyor submitted the reporting for surveyor review
  'surveyor-approved', // surveyor approved the assistant's work
  'pending-authorization', // certificate signed, waiting for manager approval
  'completed', // manager approved; visible in View Report
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses in which the reporting sections can still be edited. */
export const EDITABLE_JOB_STATUSES: JobStatus[] = ['allocated', 'booked', 'in-progress', 'surveyor-approved'];

export interface IJobDocument {
  _id?: mongoose.Types.ObjectId;
  name: string;
  key: string;
  url?: string;
  contentType?: string;
  size?: number;
  uploadedAt: Date;
  uploadedBy?: mongoose.Types.ObjectId;
}

export interface IJobStatusChange {
  from?: JobStatus | null;
  to: JobStatus;
  by?: mongoose.Types.ObjectId;
  byName?: string;
  at: Date;
  reason?: string;
}

export interface IJob extends Document {
  request: mongoose.Types.ObjectId;
  requestNumber: string;
  jobNumber?: string;
  quotation?: mongoose.Types.ObjectId;
  quotationNumber?: string;
  vessel: mongoose.Types.ObjectId;
  vesselName: string;
  vesselCode?: string;
  uqmsNumber?: string;
  sector: Sector;
  mainSurveyType: MainSurveyType;
  surveyTypes: mongoose.Types.ObjectId[];
  surveyor: mongoose.Types.ObjectId;
  assistantSurveyors: mongoose.Types.ObjectId[];
  mssProofRequired: boolean;
  firstEntry?: mongoose.Types.ObjectId;
  booking?: mongoose.Types.ObjectId;
  surveyReport?: mongoose.Types.ObjectId;
  supportingDocuments: IJobDocument[];
  status: JobStatus;
  statusHistory: IJobStatusChange[];
  submittedBy?: mongoose.Types.ObjectId;
  submittedAt?: Date;
  completedAt?: Date;
  allocatedBy?: mongoose.Types.ObjectId;
  allocatedAt?: Date;
  /** Created by the V2 data migration from pre-V2 records. */
  legacy: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const jobDocumentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    contentType: { type: String, trim: true },
    size: { type: Number, min: 0 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const statusChangeSchema = new Schema(
  {
    from: { type: String, enum: [...JOB_STATUSES, null] },
    to: { type: String, enum: JOB_STATUSES, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    reason: { type: String, trim: true },
  },
  { _id: false }
);

const jobSchema = new Schema(
  {
    request: { type: Schema.Types.ObjectId, ref: 'Request', required: true, unique: true },
    requestNumber: { type: String, required: true, trim: true },
    jobNumber: { type: String, trim: true },
    quotation: { type: Schema.Types.ObjectId, ref: 'Quotation' },
    quotationNumber: { type: String, trim: true },
    vessel: { type: Schema.Types.ObjectId, ref: 'Vessel', required: true, index: true },
    vesselName: { type: String, required: true, trim: true },
    vesselCode: { type: String, trim: true },
    uqmsNumber: { type: String, trim: true, index: true },
    sector: { type: String, enum: ['marine', 'industrial'], required: true },
    mainSurveyType: { type: String, enum: MAIN_SURVEY_TYPES, required: true },
    surveyTypes: [{ type: Schema.Types.ObjectId, ref: 'SurveyType' }],
    surveyor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assistantSurveyors: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [], index: true },
    mssProofRequired: { type: Boolean, default: true },
    firstEntry: { type: Schema.Types.ObjectId, ref: 'FirstEntry' },
    booking: { type: Schema.Types.ObjectId, ref: 'FirstEntrySurveyBooking', index: true },
    surveyReport: { type: Schema.Types.ObjectId, ref: 'FirstEntrySurveyReport', index: true },
    supportingDocuments: { type: [jobDocumentSchema], default: [] },
    status: { type: String, enum: JOB_STATUSES, default: 'allocated', index: true },
    statusHistory: { type: [statusChangeSchema], default: [] },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    completedAt: { type: Date },
    allocatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    allocatedAt: { type: Date },
    legacy: { type: Boolean, default: false },
  },
  { timestamps: true }
);

jobSchema.index({ sector: 1, mainSurveyType: 1, status: 1 });

jobSchema.plugin(auditPlugin, { entityType: 'job' });

const Job = mongoose.model<IJob>('Job', jobSchema);

export default Job;
