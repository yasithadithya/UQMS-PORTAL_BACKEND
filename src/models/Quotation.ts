import mongoose, { Schema, Document } from 'mongoose';
import { FEE_CURRENCIES, FeeCurrency } from './FeeItem';

export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'superseded'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/** Statuses in which a quotation can still be edited, or superseded by a new revision. */
export const OPEN_QUOTATION_STATUSES: QuotationStatus[] = ['draft', 'sent'];

export interface IQuotationLineItem {
  feeItem?: mongoose.Types.ObjectId;
  description: string;
  currency: FeeCurrency;
  rate: number;
  quantity: number;
  /** rate × quantity, converted with the quotation's exchange rate for USD lines. */
  amountLkr: number;
  /** Values for the quotation's extra columns, in the same order as `extraColumns`. */
  extra: string[];
}

export const DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Discount on the subtotal; only users with the `discount` action may set or change it. */
export interface IQuotationDiscount {
  type: DiscountType;
  /** Percentage (0–100) or an LKR amount. */
  value: number;
  description?: string;
}

/**
 * Internal approval of the quotation before it goes to the client. An approved quotation prints
 * as system generated, with no signature needed.
 */
export interface IQuotationApproval {
  approvedBy: mongoose.Types.ObjectId;
  approvedByName: string;
  approvedAt: Date;
}

export interface IQuotationClient {
  companyName: string;
  address?: string;
  contactPerson?: string;
  email?: string;
}

/**
 * A quotation for a request (job). A request can have several: when the client rejects one, a
 * revision is issued with the same base number and a -R{n} suffix, and every revision is kept.
 */
export interface IQuotation extends Document {
  request: mongoose.Types.ObjectId;
  requestNumber: string;
  jobNumber?: string;
  /** Number from the "quotation" document counter, shared by all revisions of a request. */
  baseNumber: string;
  revision: number;
  /** baseNumber for revision 0, otherwise `${baseNumber}-R${revision}`. */
  quotationNumber: string;
  quotationDate: Date;
  title: string;
  vesselName: string;
  /** Vessel code the quotation is priced for (SSC, IVCC, LCC, LYC); picks the applicable fees. */
  vesselCode?: string;
  client: IQuotationClient;
  /** Labels of user-added table columns, shown between Description and Rate. */
  extraColumns: string[];
  /** LKR per 1 USD. */
  exchangeRate: number;
  lineItems: IQuotationLineItem[];
  /** Sum of the lines before discount. Missing on quotations created before discounts existed. */
  subtotalLkr?: number;
  discount?: IQuotationDiscount;
  discountLkr: number;
  /** subtotalLkr − discountLkr. */
  totalLkr: number;
  notes: string[];
  paymentTerms: string[];
  preparedByName?: string;
  preparedByDesignation?: string;
  /** Internal approval; cleared when the quotation is edited. */
  approval?: IQuotationApproval;
  /** When and to whom the quotation (with the RFS) was last emailed. */
  emailedAt?: Date;
  emailedTo?: string;
  status: QuotationStatus;
  statusReason?: string;
  statusChangedAt?: Date;
  statusChangedBy?: mongoose.Types.ObjectId;
  revisedFrom?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema(
  {
    feeItem: {
      type: Schema.Types.ObjectId,
      ref: 'FeeItem',
    },
    description: {
      type: String,
      required: [true, 'Line description is required'],
      trim: true,
    },
    currency: {
      type: String,
      enum: FEE_CURRENCIES,
      required: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 1,
    },
    amountLkr: {
      type: Number,
      required: true,
      min: 0,
    },
    extra: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const discountSchema = new Schema(
  {
    type: { type: String, enum: DISCOUNT_TYPES, required: true },
    value: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const approvalSchema = new Schema(
  {
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedByName: { type: String, required: true, trim: true },
    approvedAt: { type: Date, required: true },
  },
  { _id: false }
);

const quotationSchema: Schema = new Schema(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Request reference is required'],
      index: true,
    },
    requestNumber: {
      type: String,
      required: true,
      trim: true,
    },
    jobNumber: {
      type: String,
      trim: true,
    },
    baseNumber: {
      type: String,
      required: true,
      trim: true,
    },
    revision: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    quotationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    quotationDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    vesselName: {
      type: String,
      trim: true,
    },
    vesselCode: {
      type: String,
      trim: true,
    },
    extraColumns: {
      type: [{ type: String, trim: true }],
      default: [],
    },
    client: {
      companyName: { type: String, required: [true, 'Client company name is required'], trim: true },
      address: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      email: { type: String, trim: true },
    },
    exchangeRate: {
      type: Number,
      required: [true, 'Conversion rate is required'],
      min: 0,
    },
    lineItems: {
      type: [lineItemSchema],
      validate: {
        validator: (items: unknown[]) => Array.isArray(items) && items.length > 0,
        message: 'At least one line item is required',
      },
    },
    subtotalLkr: {
      type: Number,
      min: 0,
    },
    discount: {
      type: discountSchema,
      required: false,
    },
    discountLkr: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalLkr: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: [String],
      default: [],
    },
    paymentTerms: {
      type: [String],
      default: [],
    },
    preparedByName: {
      type: String,
      trim: true,
    },
    preparedByDesignation: {
      type: String,
      trim: true,
    },
    approval: {
      type: approvalSchema,
      required: false,
    },
    emailedAt: {
      type: Date,
    },
    emailedTo: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: QUOTATION_STATUSES,
      default: 'draft',
      index: true,
    },
    statusReason: {
      type: String,
      trim: true,
    },
    statusChangedAt: {
      type: Date,
    },
    statusChangedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    revisedFrom: {
      type: Schema.Types.ObjectId,
      ref: 'Quotation',
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

quotationSchema.index({ request: 1, revision: 1 }, { unique: true });

const Quotation = mongoose.model<IQuotation>('Quotation', quotationSchema);

export default Quotation;
