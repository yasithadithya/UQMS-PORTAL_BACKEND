import mongoose, { Schema, Document } from 'mongoose';

export interface IPaintDetail {
  coatNumber: string;
  productName: string;
  productNumber: string;
  dft: string;
  coatType: string;
}

export interface IDockingSurveyCert extends Document {
  certificateNumber: string;
  vesselId: mongoose.Types.ObjectId;
  surveyReportId: mongoose.Types.ObjectId;
  surveyBookingId: mongoose.Types.ObjectId;
  client: string;
  surveyLocation: string;
  dockingPeriodStart?: Date;
  dockingPeriodEnd?: Date;
  constructionMaterial: string;
  propellerDetails: string;
  tailShaftBearings: string;
  bracketBearing: string;
  thicknessMeasurementsBy: string;
  tmReportNo: string;
  tmReportDate?: Date;
  antifoulingPaintBy: string;
  coatingCondition: string;
  paintDetails: IPaintDetail[];
  plateRenewals: string;
  
  // Clearances
  sternTubeClearancePortPS: string;
  sternTubeClearancePortTB: string;
  sternTubeClearanceStbdPS: string;
  sternTubeClearanceStbdTB: string;

  aBracketClearancePortPS: string;
  aBracketClearancePortTB: string;
  aBracketClearanceStbdPS: string;
  aBracketClearanceStbdTB: string;

  rudderBearingPortPS: string;
  rudderBearingPortFA: string;
  rudderBearingStbdPS: string;
  rudderBearingStbdFA: string;

  overboardValves: string;
  anodes: string;
  dateOfIssue: Date;
  
  issuedBy: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paintDetailSchema = new Schema<IPaintDetail>({
  coatNumber: { type: String, trim: true },
  productName: { type: String, trim: true },
  productNumber: { type: String, trim: true },
  dft: { type: String, trim: true },
  coatType: { type: String, trim: true }
});

const dockingSurveyCertSchema: Schema = new Schema(
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
    client: { type: String, trim: true, default: '' },
    surveyLocation: { type: String, trim: true, default: '' },
    dockingPeriodStart: { type: Date },
    dockingPeriodEnd: { type: Date },
    constructionMaterial: { type: String, trim: true, default: 'Light Alloy' },
    propellerDetails: { type: String, trim: true, default: '2 fixed pitch propellers' },
    tailShaftBearings: { type: String, trim: true, default: 'water lubricated outer bearings' },
    bracketBearing: { type: String, trim: true, default: 'A bracket bearing' },
    thicknessMeasurementsBy: { type: String, trim: true, default: 'LANKA HIGH TECH MARINE (PVT) LTD' },
    tmReportNo: { type: String, trim: true, default: '' },
    tmReportDate: { type: Date },
    antifoulingPaintBy: { type: String, trim: true, default: 'HEMPLE' },
    coatingCondition: { type: String, trim: true, default: 'Good' },
    paintDetails: { type: [paintDetailSchema], default: [] },
    plateRenewals: { type: String, trim: true, default: '' },
    
    sternTubeClearancePortPS: { type: String, trim: true, default: '' },
    sternTubeClearancePortTB: { type: String, trim: true, default: '' },
    sternTubeClearanceStbdPS: { type: String, trim: true, default: '' },
    sternTubeClearanceStbdTB: { type: String, trim: true, default: '' },

    aBracketClearancePortPS: { type: String, trim: true, default: '' },
    aBracketClearancePortTB: { type: String, trim: true, default: '' },
    aBracketClearanceStbdPS: { type: String, trim: true, default: '' },
    aBracketClearanceStbdTB: { type: String, trim: true, default: '' },

    rudderBearingPortPS: { type: String, trim: true, default: '' },
    rudderBearingPortFA: { type: String, trim: true, default: '' },
    rudderBearingStbdPS: { type: String, trim: true, default: '' },
    rudderBearingStbdFA: { type: String, trim: true, default: '' },

    overboardValves: { type: String, trim: true, default: 'Overboard valves have been cleaned, overhauled and examined.' },
    anodes: { type: String, trim: true, default: '' },
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

const DockingSurveyCert = mongoose.model<IDockingSurveyCert>('DockingSurveyCert', dockingSurveyCertSchema);

export default DockingSurveyCert;
