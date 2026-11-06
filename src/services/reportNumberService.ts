import DocumentNumberModel from '../models/DocumentNumber';
import Job from '../models/Job';
import { getNextDocumentNumber } from './documentNumberService';

const COUNTER = 'report';

/** Makes sure the report number counter exists (REP-0101 is the first number issued). */
const ensureReportCounter = async (): Promise<void> => {
  await DocumentNumberModel.updateOne(
    { name: COUNTER },
    { $setOnInsert: { name: COUNTER, prefix: 'REP-', digits: 4, lastNumber: 100 } },
    { upsert: true }
  );
};

/** Issues the next survey report number. */
export const issueReportNumber = async (): Promise<string> => {
  await ensureReportCounter();
  return getNextDocumentNumber(COUNTER);
};

/**
 * V2: First Entry jobs receive their report number at Surveyor Allocation. A booking made for such a
 * job takes that number; bookings with no allocated job (pre-V2 flow) are issued a new one.
 */
export const reportNumberForBooking = async (requestIds: unknown): Promise<string> => {
  const ids = (Array.isArray(requestIds) ? requestIds : [requestIds]).filter(Boolean);
  if (ids.length) {
    const job = await Job.findOne({ request: { $in: ids }, reportNumber: { $nin: [null, ''] } })
      .select('reportNumber')
      .lean();
    if (job?.reportNumber) return job.reportNumber;
  }
  return issueReportNumber();
};
