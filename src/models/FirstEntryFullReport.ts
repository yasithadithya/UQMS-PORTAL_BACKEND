import mongoose, { Schema, Document } from 'mongoose';

// Sub-interface for comments on a general remark
export interface IRemarkComment {
  _id: mongoose.Types.ObjectId;
  text: string;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

// Sub-interface for general remarks
export interface IGeneralRemark {
  _id: mongoose.Types.ObjectId;
  text: string;
  isClosed: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  comments: IRemarkComment[];
}

// Sub-interface for the files uploaded per checklist item
export interface IChecklistItemFile {
  filename: string;
  key: string;
  url?: string;
  mimeType?: string;
  size?: number;
}

// Sub-interface for the checklist items in the full report
export interface IChecklistItem {
  checklistQuestionId: mongoose.Types.ObjectId;
  isChecked?: boolean;
  comment?: 'Satisfactory' | 'Unsatisfactory' | 'N/A' | '';
  visitNumber?: string;
  surveyNames?: string[];
  surveyDate?: Date;
  updatedDate?: Date;
  remarks?: string;
  additionalFields?: { name: string; value: string }[];
  files?: IChecklistItemFile[];
  surveyorId?: mongoose.Types.ObjectId;
  surveyorName?: string;
}

// Main Interface for the First Entry Full Report
export interface IFirstEntryFullReport extends Document {
  firstEntrySurveyReportId: mongoose.Types.ObjectId; // Links to FirstEntrySurveyReport
  bookingId: mongoose.Types.ObjectId;                 // Links to FirstEntrySurveyBooking
  vesselId: mongoose.Types.ObjectId;                  // Links to Vessel
  uqmsNo?: string;
  checklist: IChecklistItem[];
  remarks: IGeneralRemark[];
  dailyReportPdfKey?: string;
  dailyReportPdfUrl?: string;
  dailyReportPdfBucket?: string;
  dailyReportPdfFilename?: string;
  dailyReportPdfSize?: number;
  dailyReportPdfEtag?: string;
  dailyReportPdfGeneratedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Sub-schema for files uploaded per checklist item
const checklistItemFileSchema = new Schema<IChecklistItemFile>({
  filename: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true },
  url: { type: String, trim: true },
  mimeType: { type: String, trim: true },
  size: { type: Number }
});

// Sub-schema for individual checklist items
const checklistItemSchema = new Schema<IChecklistItem>({
  checklistQuestionId: { 
    type: Schema.Types.ObjectId, 
    ref: 'ChecklistQuestion', 
    required: [true, 'Checklist question reference is required'] 
  },
  isChecked: {
    type: Boolean,
    default: false
  },
  comment: { 
    type: String, 
    enum: ['Satisfactory', 'Unsatisfactory', 'N/A', ''], 
    default: '',
    trim: true
  },
  visitNumber: { 
    type: String, 
    trim: true,
    default: ''
  },
  surveyNames: { 
    type: [String], 
    default: []
  },
  surveyDate: { 
    type: Date 
  },
  updatedDate: { 
    type: Date, 
    default: Date.now 
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  additionalFields: {
    type: [{
      name: { type: String, required: true },
      value: { type: String, default: '' }
    }],
    default: []
  },
  files: {
    type: [checklistItemFileSchema],
    default: []
  },
  surveyorId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  surveyorName: {
    type: String,
    trim: true
  }
});

// Sub-schema for comments on a general remark
const remarkCommentSchema = new Schema<IRemarkComment>(
  {
    text: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true, trim: true }
  },
  {
    timestamps: true
  }
);

// Sub-schema for general remarks
const generalRemarkSchema = new Schema<IGeneralRemark>(
  {
    text: { type: String, required: true, trim: true },
    isClosed: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true, trim: true },
    comments: { type: [remarkCommentSchema], default: [] }
  },
  {
    timestamps: true
  }
);

// Main Full Report Schema
const firstEntryFullReportSchema: Schema = new Schema(
  {
    firstEntrySurveyReportId: {
      type: Schema.Types.ObjectId,
      ref: 'FirstEntrySurveyReport',
      required: [true, 'First Entry Survey Report reference is required'],
      unique: true // A survey report should map to at most one full report
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'FirstEntrySurveyBooking',
      required: [true, 'Booking reference is required']
    },
    vesselId: {
      type: Schema.Types.ObjectId,
      ref: 'Vessel',
      required: [true, 'Vessel reference is required']
    },
    uqmsNo: {
      type: String,
      trim: true
    },
    checklist: {
      type: [checklistItemSchema],
      default: []
    },
    remarks: {
      type: [generalRemarkSchema],
      default: []
    },
    dailyReportPdfKey: {
      type: String,
      trim: true
    },
    dailyReportPdfUrl: {
      type: String,
      trim: true
    },
    dailyReportPdfBucket: {
      type: String,
      trim: true
    },
    dailyReportPdfFilename: {
      type: String,
      trim: true
    },
    dailyReportPdfSize: {
      type: Number
    },
    dailyReportPdfEtag: {
      type: String,
      trim: true
    },
    dailyReportPdfGeneratedAt: {
      type: Date
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
  }
);

const FirstEntryFullReport = mongoose.model<IFirstEntryFullReport>('FirstEntryFullReport', firstEntryFullReportSchema);

export default FirstEntryFullReport;
