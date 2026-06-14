import mongoose, { Schema, Document } from 'mongoose';

export interface IEquipmentRecordItem {
  questionId: mongoose.Types.ObjectId;
  status: 'Provided' | 'Not Provided' | 'Not Applicable';
  remarks?: string;
}

export interface IVesselEquipmentRecord extends Document {
  vesselId: mongoose.Types.ObjectId;
  surveyReportId: mongoose.Types.ObjectId;
  equipmentRecords: IEquipmentRecordItem[];
  createdAt: Date;
  updatedAt: Date;
}

const equipmentRecordItemSchema = new Schema<IEquipmentRecordItem>({
  questionId: {
    type: Schema.Types.ObjectId,
    ref: 'RecEquipQues',
    required: true,
  },
  status: {
    type: String,
    enum: ['Provided', 'Not Provided', 'Not Applicable'],
    default: 'Not Provided',
  },
  remarks: {
    type: String,
    trim: true,
    default: '',
  },
});

const vesselEquipmentRecordSchema: Schema = new Schema(
  {
    vesselId: {
      type: Schema.Types.ObjectId,
      ref: 'Vessel',
      required: [true, 'Vessel ID is required'],
    },
    surveyReportId: {
      type: Schema.Types.ObjectId,
      ref: 'FirstEntrySurveyReport',
      required: [true, 'Survey Report ID is required'],
      unique: true,
    },
    equipmentRecords: {
      type: [equipmentRecordItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const VesselEquipmentRecord = mongoose.model<IVesselEquipmentRecord>(
  'VesselEquipmentRecord',
  vesselEquipmentRecordSchema
);

export default VesselEquipmentRecord;
