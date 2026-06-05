import mongoose, { Schema, Document } from 'mongoose';

export interface IChecklistQuestion extends Document {
  question: string;
  surveyCategories: mongoose.Types.ObjectId[];
  lengths: string[];
  areaOfOperations: mongoose.Types.ObjectId[];
  boatTypes: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const checklistQuestionSchema: Schema = new Schema(
  {
    question: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
    },
    surveyCategories: {
      type: [{ type: Schema.Types.ObjectId, ref: 'SurveyType' }],
      default: [],
    },
    lengths: {
      type: [{ type: String }],
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
