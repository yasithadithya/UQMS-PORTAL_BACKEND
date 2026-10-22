import DocumentNumber from '../models/DocumentNumber';
import Vessel from '../models/Vessel';
import { getNextDocumentNumber } from './documentNumberService';

const COUNTER = 'UQMS';

/**
 * Makes sure the UQMS counter exists. When it is missing it is created so that numbering continues
 * after the highest number already stored on a vessel. Existing counters are never changed.
 */
export const ensureUqmsCounter = async (): Promise<void> => {
  const existing = await DocumentNumber.findOne({ name: COUNTER }).lean();
  if (existing) return;

  const prefix = process.env.UQMS_NUMBER_PREFIX ?? 'UQMS-';
  const digits = Number(process.env.UQMS_NUMBER_DIGITS ?? 4);
  const numbers = await Vessel.find({ uqmsNumber: { $nin: [null, ''] } }).select('uqmsNumber').lean();
  const highest = numbers.reduce((max, v) => {
    const match = /(\d+)\s*$/.exec(String(v.uqmsNumber ?? ''));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  await DocumentNumber.updateOne(
    { name: COUNTER },
    { $setOnInsert: { name: COUNTER, prefix, digits, lastNumber: highest } },
    { upsert: true }
  );
};

/**
 * V2: the UQMS number belongs to the vessel and is issued at its first Surveyor Allocation.
 * Returns the vessel's existing number, or issues a new one. The conditional update means two
 * allocations racing on the same vessel cannot both assign a number.
 */
export const ensureVesselUqmsNumber = async (vesselId: unknown): Promise<string> => {
  const vessel = await Vessel.findById(vesselId).select('uqmsNumber').lean();
  if (!vessel) throw new Error('Vessel not found.');
  if (vessel.uqmsNumber) return vessel.uqmsNumber;

  await ensureUqmsCounter();
  const uqmsNumber = await getNextDocumentNumber(COUNTER);
  const updated = await Vessel.findOneAndUpdate(
    { _id: vesselId, $or: [{ uqmsNumber: { $exists: false } }, { uqmsNumber: null }, { uqmsNumber: '' }] },
    { $set: { uqmsNumber } },
    { new: true, audit: { action: 'vessel.uqms-number.assign' } } as any
  ).lean();
  if (updated?.uqmsNumber) return updated.uqmsNumber;

  // Another allocation assigned a number first; use that one.
  const current = await Vessel.findById(vesselId).select('uqmsNumber').lean();
  return current?.uqmsNumber ?? uqmsNumber;
};
