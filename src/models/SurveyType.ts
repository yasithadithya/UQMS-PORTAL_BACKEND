import mongoose, { Schema, Document } from 'mongoose';
import { MAIN_SURVEY_TYPES, MainSurveyType, SUB_TYPE_SECTORS, SubTypeSector } from '../config/surveyCategories';

export interface ISurveyType extends Document {
  code: string;
  name: string;
  description?: string;
  /**
   * V2: the main survey types this sub type belongs to. A sub type can sit under several main types
   * (e.g. Annual Survey under First Entry and New Constructions). Empty = not mapped yet.
   */
  mainTypes: MainSurveyType[];
  /** V2: which sector offers this sub type. */
  sector: SubTypeSector;
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
    mainTypes: {
      type: [{ type: String, enum: MAIN_SURVEY_TYPES }],
      default: [],
    },
    sector: {
      type: String,
      enum: SUB_TYPE_SECTORS,
      default: 'marine',
    },
  },
  {
    timestamps: true,
  }
);

surveyTypeSchema.index({ mainTypes: 1 });

const SurveyType = mongoose.model<ISurveyType>('SurveyType', surveyTypeSchema);

/**
 * One-off, idempotent: survey types used to hold a single `mainType`. Move it into `mainTypes`
 * and drop the old field. Runs at server start.
 */
export const migrateSurveyTypeMainTypes = async (): Promise<void> => {
  const legacy = await SurveyType.collection
    .find({ mainType: { $exists: true } }, { projection: { mainType: 1, mainTypes: 1 } })
    .toArray();
  if (legacy.length === 0) return;
  for (const doc of legacy) {
    const existing: string[] = Array.isArray(doc.mainTypes) ? doc.mainTypes : [];
    const merged = doc.mainType && !existing.includes(doc.mainType) ? [...existing, doc.mainType] : existing;
    await SurveyType.collection.updateOne({ _id: doc._id }, { $set: { mainTypes: merged }, $unset: { mainType: '' } });
  }
  console.log(`✅ Survey types: moved ${legacy.length} single main type(s) to the multi main type list.`);
};

export default SurveyType;
