import mongoose, { Schema, Document } from 'mongoose';

export interface ISurveyFindingItem {
  category: string; // e.g. 'Hull', 'Machinery', 'Life Saving Appliances LSA', 'Fire Fighting Appliances FFA', 'Navigation Equipment', 'Radio Installations'
  status: 'Satisfactory' | 'Not Satisfactory' | 'N/A';
}

export interface ISCCCOS extends Document {
  certificateNumber: string;
  vesselId: mongoose.Types.ObjectId;
  surveyReportId: mongoose.Types.ObjectId;
  surveyBookingId: mongoose.Types.ObjectId;
  surveyFindings: ISurveyFindingItem[];
  typeOfSurvey?: string;
  nominatedDeparturePoint?: string;
  dateOfIssue: Date;
  issuedBy: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const surveyFindingItemSchema = new Schema<ISurveyFindingItem>({
  category: {
    type: String,
    required: [true, 'Finding category is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['Satisfactory', 'Not Satisfactory', 'N/A'],
    required: [true, 'Finding status is required'],
    default: 'N/A'
  }
});

const scccosSchema: Schema = new Schema(
  {
    certificateNumber: {
      type: String,
      required: [true, 'Certificate number is required'],
      unique: true,
      trim: true
    },
    vesselId: {
      type: Schema.Types.ObjectId,
      ref: 'Vessel',
      required: [true, 'Vessel ID reference is required']
    },
    surveyReportId: {
      type: Schema.Types.ObjectId,
      ref: 'FirstEntrySurveyReport',
      required: [true, 'Survey Report ID reference is required']
    },
    surveyBookingId: {
      type: Schema.Types.ObjectId,
      ref: 'FirstEntrySurveyBooking',
      required: [true, 'Survey Booking ID reference is required']
    },
    surveyFindings: {
      type: [surveyFindingItemSchema],
      default: []
    },
    typeOfSurvey: {
      type: String,
      default: 'SSC Initial Survey',
      trim: true
    },
    nominatedDeparturePoint: {
      type: String,
      default: 'Following respective Ports: Colombo, Galle, Hambantota, Trincomalee',
      trim: true
    },
    dateOfIssue: {
      type: Date,
      required: [true, 'Date of issue is required'],
      default: Date.now
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Issued by reference is required']
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
    timestamps: true
  }
);

const SCCCOS = mongoose.model<ISCCCOS>('SCCCOS', scccosSchema);

export default SCCCOS;
