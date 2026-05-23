import mongoose, { Schema, Document } from 'mongoose';

export interface ISurveyType extends Document {
  code: string;
  name: string;
  description?: string;
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
  },
  {
    timestamps: true,
  }
);

const SurveyType = mongoose.model<ISurveyType>('SurveyType', surveyTypeSchema);

export default SurveyType;
