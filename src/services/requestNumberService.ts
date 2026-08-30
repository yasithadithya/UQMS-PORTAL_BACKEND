import DocumentNumber from '../models/DocumentNumber';
import { getNextDocumentNumber } from './documentNumberService';

export interface RequestNumbers {
  requestNumber: string;
  rfsDocNo: string;
}

/**
 * Allocates the next request number (RQ####) and RFS document number (RFS-####).
 *
 * Both counters are incremented with an atomic $inc, so concurrent callers
 * (staff creating a request in the portal, and the public website intake)
 * never receive the same number.
 *
 * The rfsDocNo counter is created on first use, since older installations were
 * seeded before it existed.
 */
export const allocateRequestNumbers = async (): Promise<RequestNumbers> => {
  const requestNumber = await getNextDocumentNumber('request');

  const rfsDocNoConfig = await DocumentNumber.findOne({ name: 'rfsDocNo' });
  if (!rfsDocNoConfig) {
    await new DocumentNumber({
      name: 'rfsDocNo',
      prefix: 'RFS-',
      digits: 4,
      lastNumber: -1,
    }).save();
  }
  const rfsDocNo = await getNextDocumentNumber('rfsDocNo');

  return { requestNumber, rfsDocNo };
};
