import mongoose, { Schema, Document } from 'mongoose';

export interface IChecklistQuestion extends Document {
  item: string;
  description?: string;
  additionalFields?: string[];
  surveyCategories: mongoose.Types.ObjectId[];
  areaOfOperations: mongoose.Types.ObjectId[];
  boatTypes: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  vesselCode?: string;
  qCategory?: string;
  createdAt: Date;
  updatedAt: Date;
}

const checklistQuestionSchema: Schema = new Schema(
  {
    item: {
      type: String,
      required: [true, 'Item text is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    additionalFields: {
      type: [{ type: String, enum: ['Model', 'Serial Number', 'Qty', 'Capacity', 'Type', 'Last Service'] }],
      default: [],
    },
    surveyCategories: {
      type: [{ type: Schema.Types.ObjectId, ref: 'SurveyType' }],
      default: [],
    },
    areaOfOperations: {
      type: [{ type: Schema.Types.ObjectId, ref: 'AreaOfOperation' }],
      default: [],
    },
    boatTypes: {
      type: [{ type: Schema.Types.ObjectId, ref: 'VesselType' }],
      default: [],
    },
    vesselCode: {
      type: String,
      default: null,
    },
    qCategory: {
      type: String,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const ChecklistQuestion = mongoose.model<IChecklistQuestion>('ChecklistQuestion', checklistQuestionSchema);

export default ChecklistQuestion;
