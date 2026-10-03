import mongoose from 'mongoose';
import FirstEntry from '../models/FirstEntry';
import Quotation, { DISCOUNT_TYPES, DiscountType, IQuotationDiscount, IQuotationLineItem } from '../models/Quotation';
import { FEE_CURRENCIES, FeeCurrency } from '../models/FeeItem';
import { getNextDocumentNumber } from './documentNumberService';

/** Document number config that issues quotation numbers (e.g. QT/26/0028). */
export const QUOTATION_DOCUMENT_NUMBER = 'quotation';

export const DEFAULT_QUOTATION_NOTES = [
  'As per the client’s request, transportation, port formalities, accommodation and meals shall be provided by the client during the survey period.',
  'Any additional visits (including deficiency/repair verification, re-visits arising due to inadequate completion, or surveys cancelled at site) will be charged at USD 150 per visit.',
  'Any other scope apart from the above will be quoted separately.',
];

export const DEFAULT_PAYMENT_TERMS = [
  '50% advance payment shall be made upon confirmation of the survey and prior to survey attendance.',
  'The remaining 50% of the total payment shall be made prior to the issuance of the final deliverables.',
];

/** A client or validation error that the controller returns with its status code. */
export class QuotationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value));

/** Most extra columns a quotation table can have, so the PDF table stays readable. */
export const MAX_EXTRA_COLUMNS = 3;

/** Validates the labels of user-added table columns. */
export const cleanExtraColumns = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new QuotationError(400, 'Extra columns must be a list of column names.');
  const columns = value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (columns.some((label) => !label)) throw new QuotationError(400, 'Every extra column needs a name.');
  if (columns.length > MAX_EXTRA_COLUMNS) throw new QuotationError(400, `A quotation can have at most ${MAX_EXTRA_COLUMNS} extra columns.`);
  return columns;
};

/**
 * Validates the submitted lines and computes each amount in LKR plus the subtotal.
 * USD lines are converted with the exchange rate; amounts are rounded to 2 decimals.
 */
export const buildLineItems = (
  rawLines: unknown,
  exchangeRateInput: unknown,
  extraColumnCount = 0
): { lineItems: IQuotationLineItem[]; totalLkr: number; exchangeRate: number } => {
  const exchangeRate = toNumber(exchangeRateInput);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new QuotationError(400, 'Conversion rate must be a number greater than 0.');
  }
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new QuotationError(400, 'Add at least one line item.');
  }

  const lineItems = rawLines.map((raw: any, index): IQuotationLineItem => {
    const line = index + 1;
    const description = typeof raw?.description === 'string' ? raw.description.trim() : '';
    const currency = raw?.currency as FeeCurrency;
    const rate = toNumber(raw?.rate);
    const quantity = raw?.quantity === undefined || raw?.quantity === '' ? 1 : toNumber(raw.quantity);

    if (!description) throw new QuotationError(400, `Line ${line}: description is required.`);
    if (!FEE_CURRENCIES.includes(currency)) throw new QuotationError(400, `Line ${line}: currency must be USD or LKR.`);
    if (!Number.isFinite(rate) || rate < 0) throw new QuotationError(400, `Line ${line}: rate must be 0 or more.`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new QuotationError(400, `Line ${line}: quantity must be greater than 0.`);

    const amount = rate * quantity * (currency === 'USD' ? exchangeRate : 1);
    const rawExtra: unknown[] = Array.isArray(raw?.extra) ? raw.extra : [];
    const extra = Array.from({ length: extraColumnCount }, (_, i) => (typeof rawExtra[i] === 'string' ? (rawExtra[i] as string).trim() : ''));
    return {
      extra,
      feeItem: raw?.feeItem && mongoose.isValidObjectId(raw.feeItem) ? raw.feeItem : undefined,
      description,
      currency,
      rate,
      quantity,
      amountLkr: round2(amount),
    };
  });

  const totalLkr = round2(lineItems.reduce((sum, item) => sum + item.amountLkr, 0));
  return { lineItems, totalLkr, exchangeRate };
};

/**
 * Validates a discount and works out its LKR amount against the subtotal.
 * An absent or zero discount returns { discount: undefined, discountLkr: 0 }.
 */
export const buildDiscount = (raw: unknown, subtotalLkr: number): { discount?: IQuotationDiscount; discountLkr: number } => {
  if (raw === undefined || raw === null || raw === '') return { discount: undefined, discountLkr: 0 };
  const input = raw as { type?: unknown; value?: unknown; description?: unknown };
  const type = input.type as DiscountType;
  const value = toNumber(input.value);
  if (!DISCOUNT_TYPES.includes(type)) throw new QuotationError(400, 'Discount type must be percent or amount.');
  if (!Number.isFinite(value) || value < 0) throw new QuotationError(400, 'Discount must be 0 or more.');
  if (value === 0) return { discount: undefined, discountLkr: 0 };
  if (type === 'percent' && value > 100) throw new QuotationError(400, 'A percentage discount cannot exceed 100%.');

  const discountLkr = round2(type === 'percent' ? (subtotalLkr * value) / 100 : value);
  if (discountLkr > subtotalLkr) throw new QuotationError(400, 'The discount cannot be more than the subtotal.');

  const description = typeof input.description === 'string' && input.description.trim() ? input.description.trim() : undefined;
  return { discount: { type, value, description }, discountLkr };
};

/** Comparable form of a discount, for detecting changes. */
export const discountKey = (discount?: IQuotationDiscount | null): string =>
  discount && discount.value > 0 ? `${discount.type}:${discount.value}` : 'none';

export const describeDiscount = (discount?: IQuotationDiscount | null): string =>
  !discount || discount.value === 0 ? 'None' : discount.type === 'percent' ? `${discount.value}%` : `LKR ${discount.value}`;

/** Trims a list of text lines and drops the empty ones. */
export const cleanTextList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean) : [];

export const formatQuotationNumber = (baseNumber: string, revision: number): string =>
  revision === 0 ? baseNumber : `${baseNumber}-R${revision}`;

/**
 * Number for the next quotation of a request. The first quotation takes a new number from the
 * "quotation" document counter; every later one is a revision of that number.
 */
export const allocateQuotationNumber = async (
  requestId: string
): Promise<{ baseNumber: string; revision: number; quotationNumber: string }> => {
  const latest = await Quotation.findOne({ request: requestId }).sort({ revision: -1 }).select('baseNumber revision').lean();

  if (latest) {
    const revision = latest.revision + 1;
    return { baseNumber: latest.baseNumber, revision, quotationNumber: formatQuotationNumber(latest.baseNumber, revision) };
  }

  let baseNumber: string;
  try {
    baseNumber = await getNextDocumentNumber(QUOTATION_DOCUMENT_NUMBER);
  } catch {
    throw new QuotationError(400, `Document number "${QUOTATION_DOCUMENT_NUMBER}" is not configured. Add it under document number generation first.`);
  }
  return { baseNumber, revision: 0, quotationNumber: baseNumber };
};

/** Marks the request's First Entry records as quoted with the accepted quotation's number. */
export const syncFirstEntryQuotation = async (requestId: mongoose.Types.ObjectId | string, quotationNumber: string): Promise<void> => {
  await FirstEntry.updateMany({ request: requestId }, { $set: { isQuoted: true, quotationNumber } });
};
