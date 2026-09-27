import mongoose, { Schema, Document } from 'mongoose';

export const FEE_CATEGORIES = ['survey', 'transport', 'additional'] as const;
export const FEE_CURRENCIES = ['USD', 'LKR'] as const;
export const FEE_UNITS = ['visit', 'trip', 'hour', 'lump sum'] as const;

export type FeeCategory = (typeof FEE_CATEGORIES)[number];
export type FeeCurrency = (typeof FEE_CURRENCIES)[number];
export type FeeUnit = (typeof FEE_UNITS)[number];

/** One line of the survey fee structure. Quotations copy these values, so editing a fee never changes an issued quotation. */
export interface IFeeItem extends Document {
  name: string;
  category: FeeCategory;
  currency: FeeCurrency;
  /** Published list fee, before any discount. */
  standardRate?: number;
  /** Current prevailing fee, used when the item is added to a quotation. */
  rate: number;
  unit: FeeUnit;
  notes?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const feeItemSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Fee item name is required'],
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      enum: FEE_CATEGORIES,
      required: [true, 'Fee category is required'],
    },
    currency: {
      type: String,
      enum: FEE_CURRENCIES,
      required: [true, 'Currency is required'],
    },
    standardRate: {
      type: Number,
      min: 0,
    },
    rate: {
      type: Number,
      required: [true, 'Fee is required'],
      min: 0,
    },
    unit: {
      type: String,
      enum: FEE_UNITS,
      default: 'visit',
    },
    notes: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const FeeItem = mongoose.model<IFeeItem>('FeeItem', feeItemSchema);

export default FeeItem;
