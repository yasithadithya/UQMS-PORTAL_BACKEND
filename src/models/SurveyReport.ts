import mongoose, { Schema, Document } from 'mongoose';

export interface ISurveyReport extends Document {
  vesselId: mongoose.Types.ObjectId;
  firstEntrySurveyReportId: mongoose.Types.ObjectId;
  vesselEquipmentRecordId: mongoose.Types.ObjectId;
  certificateNumber?: string;
  totalPersonsOnboard?: number;
  maxPassengers?: number;
  minManning?: number;
  
  // Page 4: Hull & Stability Details
  stabilityBooklet: {
    available: boolean;
    approvedBy: string;
    approvalDate?: Date | null;
  };
  dockingSurvey: {
    harbour: string;
    date?: Date | null;
  };
  thicknessMeasurement: {
    carriedBy: string;
    harbour: string;
    date?: Date | null;
    reportNo: string;
  };
  hullStructureCondition: string; // Satisfactory / Unsatisfactory
  hullInspections: string[]; // List of checked item texts to include in the PDF report
  mainDeck: {
    coatingCondition: string; // Good / Fair / Poor
    structureCondition: string; // satisfactory / unsatisfactory
  };

  // Page 5: Access Openings & Ventilations, Tanks, Spaces
  accessOpeningsCondition: string; // satisfactory / unsatisfactory
  tanks: {
    fuelOilPortName: string; // P
    fuelOilPortFrame: string;
    fuelOilPortCondition: string; // satisfactory / unsatisfactory
    fuelOilStarboardName: string; // S
    fuelOilStarboardFrame: string;
    fuelOilStarboardCondition: string; // satisfactory / unsatisfactory
    freshWaterCenterName: string; // C
    freshWaterCenterFrame: string;
    freshWaterCenterCondition: string; // satisfactory / unsatisfactory
  };
  spaces: {
    machinerySpace: string; // Satisfactory / Unsatisfactory
    steeringGear: string; // Satisfactory / Unsatisfactory
    operatingStation: string; // Satisfactory / Unsatisfactory
    accommodation: string; // Satisfactory / Unsatisfactory
  };
  toiletCount: number;
  wheelhouse: {
    structureCondition: string; // satisfactory / unsatisfactory
    passengerSeatingCondition: string; // good / fair / poor
  };
  hasGalley: boolean;
  galleyRemarks?: string;

  // Page 7: Life Jackets
  lifeJacketsCondition: string; // satisfactory / unsatisfactory

  // Page 7-8: Mooring & Engines
  pipingCondition: string; // satisfactory / unsatisfactory
  electricalExamCondition: string; // as far as practicable / as far as predictable
  machinery: {
    mainEngineCount: number;
    mainEngineModel: string;
    mainEnginePower: string;
    mainEngineFuelType: string;
    mainEngineAlarms: string; // satisfaction / satisfactory
    
    auxEngineCount: number;
    auxEngineModel: string;
    auxEngineOutput: string;
    auxEngineAlarms: string; // satisfaction / satisfactory
    powerGeneration: string;
  };
  
  signature: {
    dateOfIssue?: Date | null;
    surveyorName: string;
    surveyorTitle: string;
    certifyingBody: string;
  };
  status: 'Draft' | 'Approved';
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const surveyReportSchema: Schema = new Schema(
  {
    vesselId: {
      type: Schema.Types.ObjectId,
      ref: 'Vessel',
      required: [true, 'Vessel reference is required'],
    },
    firstEntrySurveyReportId: {
      type: Schema.Types.ObjectId,
      ref: 'FirstEntrySurveyReport',
      required: [true, 'First Entry Survey Report reference is required'],
      unique: true,
    },
    vesselEquipmentRecordId: {
      type: Schema.Types.ObjectId,
      ref: 'VesselEquipmentRecord',
      required: [true, 'Vessel Equipment Record reference is required'],
    },
    certificateNumber: { type: String, trim: true },
    totalPersonsOnboard: { type: Number, default: 0 },
    maxPassengers: { type: Number, default: 0 },
    minManning: { type: Number, default: 0 },
    stabilityBooklet: {
      available: { type: Boolean, default: false },
      approvedBy: { type: String, default: '', trim: true },
      approvalDate: { type: Date, default: null },
    },
    dockingSurvey: {
      harbour: { type: String, default: '', trim: true },
      date: { type: Date, default: null },
    },
    thicknessMeasurement: {
      carriedBy: { type: String, default: '', trim: true },
      harbour: { type: String, default: '', trim: true },
      date: { type: Date, default: null },
      reportNo: { type: String, default: '', trim: true },
    },
    hullStructureCondition: { type: String, default: 'satisfactory', trim: true },
    hullInspections: { type: [String], default: [] },
    mainDeck: {
      coatingCondition: { type: String, default: 'Good', trim: true },
      structureCondition: { type: String, default: 'satisfactory', trim: true },
    },
    accessOpeningsCondition: { type: String, default: 'satisfactory', trim: true },
    tanks: {
      fuelOilPortName: { type: String, default: 'P', trim: true },
      fuelOilPortFrame: { type: String, default: '', trim: true },
      fuelOilPortCondition: { type: String, default: 'satisfactory', trim: true },
      fuelOilStarboardName: { type: String, default: 'S', trim: true },
      fuelOilStarboardFrame: { type: String, default: '', trim: true },
      fuelOilStarboardCondition: { type: String, default: 'satisfactory', trim: true },
      freshWaterCenterName: { type: String, default: 'C', trim: true },
      freshWaterCenterFrame: { type: String, default: '', trim: true },
      freshWaterCenterCondition: { type: String, default: 'satisfactory', trim: true },
    },
    spaces: {
      machinerySpace: { type: String, default: 'Satisfactory', trim: true },
      steeringGear: { type: String, default: 'Satisfactory', trim: true },
      operatingStation: { type: String, default: 'Satisfactory', trim: true },
      accommodation: { type: String, default: 'Satisfactory', trim: true },
    },
    toiletCount: { type: Number, default: 0 },
    wheelhouse: {
      structureCondition: { type: String, default: 'satisfactory', trim: true },
      passengerSeatingCondition: { type: String, default: 'good', trim: true },
    },
    hasGalley: { type: Boolean, default: false },
    galleyRemarks: { type: String, default: '', trim: true },
    lifeJacketsCondition: { type: String, default: 'satisfactory', trim: true },
    pipingCondition: { type: String, default: 'satisfactory', trim: true },
    electricalExamCondition: { type: String, default: 'as far as practicable', trim: true },
    machinery: {
      mainEngineCount: { type: Number, default: 2 },
      mainEngineModel: { type: String, default: 'Caterpillar', trim: true },
      mainEnginePower: { type: String, default: '714kW (970 HP)', trim: true },
      mainEngineFuelType: { type: String, default: 'Diesel', trim: true },
      mainEngineAlarms: { type: String, default: 'satisfaction', trim: true },
      
      auxEngineCount: { type: Number, default: 0 },
      auxEngineModel: { type: String, default: 'Caterpillar', trim: true },
      auxEngineOutput: { type: String, default: '17KW', trim: true },
      auxEngineAlarms: { type: String, default: 'satisfaction', trim: true },
      powerGeneration: { type: String, default: '', trim: true },
    },
    signature: {
      dateOfIssue: { type: Date, default: null },
      surveyorName: { type: String, default: '', trim: true },
      surveyorTitle: { type: String, default: 'Marine Surveyor', trim: true },
      certifyingBody: { type: String, default: 'Universal Quality Management Systems (Pvt) Ltd.', trim: true },
    },
    status: {
      type: String,
      enum: ['Draft', 'Approved'],
      default: 'Draft',
      required: [true, 'Status is required'],
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

const SurveyReport = mongoose.model<ISurveyReport>('SurveyReport', surveyReportSchema);

export default SurveyReport;
