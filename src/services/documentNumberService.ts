import DocumentNumber from '../models/DocumentNumber';

export const getNextDocumentNumber = async (name: string): Promise<string> => {
  const sequence = await DocumentNumber.findOneAndUpdate(
    { name },
    { $inc: { lastNumber: 1 } },
    { new: true }
  ).lean();

  if (!sequence) {
    throw new Error(`Document number config not found for ${name}`);
  }

  const numericPart = String(sequence.lastNumber).padStart(sequence.digits, '0');
  return `${sequence.prefix}${numericPart}`;
};
