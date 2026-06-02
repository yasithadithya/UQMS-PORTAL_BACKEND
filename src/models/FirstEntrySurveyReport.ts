import mongoose, { Schema, Document } from 'mongoose';

// Sub-interface for the surveys grid array
export interface ISurveyReportCategory {
  surveyCategory: string; // Pre-populated from surveysRequested in the booking
  surveyStatus?: string;  // e.g. "Pending", "Completed", etc.
  isPostponed?: boolean;
  postponeDate?: Date;
  surveyDate?: Date;
  assignedDate?: Date;
  dueFrom?: Date;
  dueTo?: Date;
  remarks?: string;
}

// Main Interface for the First Entry Survey Report
export interface IFirstEntrySurveyReport extends Document {
  bookingId: mongoose.Types.ObjectId;  // Links back to the booking
  vesselId?: mongoose.Types.ObjectId;   // Links to the Vessel
  shipName: string;
  managedBy?: string;
  uqmsNo?: string;
  surveyRequestedDate?: Date;           // Extracted from Request's createdAt date
  firstSurveyDate?: Date;               // Extracted as earliest visitDate from visitDetails
  reportNo: string;                     // Extracted from booking's reportNo
  portOfSurvey?: string;
  lastSurveyDate?: Date;                // Extracted as latest visitDate from visitDetails
  reportRemarks?: string;
  anniversaryDate?: Date;
  surveys: ISurveyReportCategory[];
  status?: string;                      // e.g. 'Draft', 'Approved'
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Sub-schema for individual survey categories
const surveyReportCategorySchema = new Schema<ISurveyReportCategory>({
  surveyCategory: { type: String, required: [true, 'Survey category is required'], trim: true },
  surveyStatus: { type: String, trim: true, default: 'Pending' },
  isPostponed: { type: Boolean, default: false },
  postponeDate: { type: Date },
  surveyDate: { type: Date },
  assignedDate: { type: Date },
  dueFrom: { type: Date },
  dueTo: { type: Date },
  remarks: { type: String, trim: true }
});

// Main Report Schema
const firstEntrySurveyReportSchema: Schema = new Schema(
  {
    bookingId: { 
      type: Schema.Types.ObjectId, 
      ref: 'FirstEntrySurveyBooking', 
      required: [true, 'First Entry Survey Booking reference is required'] 
    },
    vesselId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Vessel' 
    },
    shipName: { 
      type: String, 
      required: [true, 'Ship Name is required'], 
      trim: true 
    },
    managedBy: { 
      type: String, 
      trim: true 
    },
    uqmsNo: { 
      type: String, 
      trim: true 
    },
    surveyRequestedDate: { 
      type: Date 
    },
    firstSurveyDate: { 
      type: Date 
    },
    reportNo: { 
      type: String, 
      required: [true, 'Report number is required'], 
      trim: true 
    },
    portOfSurvey: { 
      type: String, 
      trim: true 
    },
    lastSurveyDate: { 
      type: Date 
    },
    reportRemarks: { 
      type: String, 
      trim: true 
    },
    anniversaryDate: { 
      type: Date 
    },
    surveys: { 
      type: [surveyReportCategorySchema], 
      default: [] 
    },
    status: { 
      type: String, 
      trim: true, 
      default: 'Draft' 
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

const FirstEntrySurveyReport = mongoose.model<IFirstEntrySurveyReport>('FirstEntrySurveyReport', firstEntrySurveyReportSchema);

export default FirstEntrySurveyReport;
