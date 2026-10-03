import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FeeItem, { FEE_CATEGORIES, FEE_CURRENCIES, FEE_UNITS } from '../models/FeeItem';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const CATEGORY_ORDER: Record<string, number> = { survey: 0, additional: 1, transport: 2 };

/** Validates the editable fields; `partial` allows fields to be omitted (updates). Returns an error message or the clean values. */
const readFeeItemBody = (body: any, partial: boolean): { error: string } | { values: Record<string, unknown> } => {
  const values: Record<string, unknown> = {};
  const has = (key: string) => body[key] !== undefined;

  if (!partial || has('name')) {
    if (!isNonEmptyString(body.name)) return { error: 'Name is required.' };
    values.name = body.name.trim();
  }
  if (!partial || has('category')) {
    if (!FEE_CATEGORIES.includes(body.category)) return { error: `Category must be one of: ${FEE_CATEGORIES.join(', ')}.` };
    values.category = body.category;
  }
  if (!partial || has('currency')) {
    if (!FEE_CURRENCIES.includes(body.currency)) return { error: 'Currency must be USD or LKR.' };
    values.currency = body.currency;
  }
  if (!partial || has('rate')) {
    const rate = Number(body.rate);
    if (body.rate === '' || body.rate === null || !Number.isFinite(rate) || rate < 0) return { error: 'Fee must be 0 or more.' };
    values.rate = rate;
  }
  if (has('standardRate')) {
    if (body.standardRate === '' || body.standardRate === null) {
      values.standardRate = undefined;
    } else {
      const standardRate = Number(body.standardRate);
      if (!Number.isFinite(standardRate) || standardRate < 0) return { error: 'Standard fee must be 0 or more.' };
      values.standardRate = standardRate;
    }
  }
  if (has('unit')) {
    if (!FEE_UNITS.includes(body.unit)) return { error: `Unit must be one of: ${FEE_UNITS.join(', ')}.` };
    values.unit = body.unit;
  }
  if (has('vesselCodes')) {
    if (!Array.isArray(body.vesselCodes)) return { error: 'Vessel codes must be a list.' };
    values.vesselCodes = Array.from(new Set(body.vesselCodes.filter(isNonEmptyString).map((code: string) => code.trim())));
  }
  if (has('notes')) values.notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;
  if (has('isActive')) values.isActive = Boolean(body.isActive);
  if (has('order')) {
    const order = Number(body.order);
    values.order = Number.isFinite(order) ? order : 0;
  }
  return { values };
};

// Get all fee items, grouped by category then by order
export const getFeeItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: Record<string, unknown> = req.query.active === 'true' ? { isActive: true } : {};
    // A vessel code narrows the list to fees for that code plus fees that apply to every code.
    if (isNonEmptyString(req.query.vesselCode)) {
      query.$or = [{ vesselCodes: req.query.vesselCode.trim() }, { vesselCodes: { $size: 0 } }, { vesselCodes: { $exists: false } }];
    }
    const feeItems = await FeeItem.find(query).sort({ order: 1, name: 1 }).lean();
    feeItems.sort((a, b) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9));
    res.status(200).json({ success: true, count: feeItems.length, data: feeItems });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching fee structure.', error: error.message });
  }
};

// Create a fee item
export const createFeeItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = readFeeItemBody(req.body, false);
    if ('error' in parsed) {
      res.status(400).json({ success: false, message: parsed.error });
      return;
    }

    const feeItem = await FeeItem.create(parsed.values);
    res.status(201).json({ success: true, message: 'Fee item created successfully.', data: feeItem });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'A fee item with this name already exists.', error: error.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Error creating fee item.', error: error.message });
  }
};

// Update a fee item. Quotations keep their own copy of the values, so existing quotations don't change.
export const updateFeeItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid fee item ID format.' });
      return;
    }

    const parsed = readFeeItemBody(req.body, true);
    if ('error' in parsed) {
      res.status(400).json({ success: false, message: parsed.error });
      return;
    }

    const unset = parsed.values.standardRate === undefined && 'standardRate' in parsed.values ? { standardRate: 1 } : undefined;
    if (unset) delete parsed.values.standardRate;

    const feeItem = await FeeItem.findByIdAndUpdate(
      id,
      { $set: parsed.values, ...(unset ? { $unset: unset } : {}) },
      { new: true, runValidators: true }
    );
    if (!feeItem) {
      res.status(404).json({ success: false, message: 'Fee item not found.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Fee item updated successfully.', data: feeItem });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'A fee item with this name already exists.', error: error.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Error updating fee item.', error: error.message });
  }
};

// Delete a fee item. Quotation lines keep their copied description and rate.
export const deleteFeeItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid fee item ID format.' });
      return;
    }

    const feeItem = await FeeItem.findByIdAndDelete(id);
    if (!feeItem) {
      res.status(404).json({ success: false, message: 'Fee item not found.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Fee item deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting fee item.', error: error.message });
  }
};
