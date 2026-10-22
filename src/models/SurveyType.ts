import mongoose, { Schema, Document } from 'mongoose';
import { MAIN_SURVEY_TYPES, MainSurveyType } from '../config/surveyCategories';

export interface ISurveyType extends Document {
  code: string;
  name: string;
  description?: string;
  /** V2: the main survey type this sub type belongs to (null = not mapped yet). */
  mainType?: MainSurveyType | null;
  /** V2: which sector offers this sub type. */
  sector: 'marine' | 'industrial' | 'both';
  createdAt: Date;
  updatedAt: Date;
}

const surveyTypeSchema: Schema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Survey type code is required'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Survey type name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    mainType: {
      type: String,
      enum: [...MAIN_SURVEY_TYPES, null],
      default: null,
    },
    sector: {
      type: String,
      enum: ['marine', 'industrial', 'both'],
      default: 'marine',
    },
  },
  {
    timestamps: true,
  }
);

const SurveyType = mongoose.model<ISurveyType>('SurveyType', surveyTypeSchema);

export default SurveyType;
