import { Response } from 'express';
import { IESignature } from '../models/ESignature';

export const SIGNED_DOCUMENT_LOCKED_MESSAGE =
  'This document has been electronically signed and is locked. An administrator must revoke the signature before it can be changed.';

export const isElectronicallySigned = (doc: { eSignature?: IESignature | null } | null | undefined): boolean =>
  Boolean(doc?.eSignature?.signedAt);

/**
 * Rejects a change to an electronically signed document with 409.
 * Returns true when the request was rejected.
 */
export const rejectIfSigned = (
  res: Response,
  doc: { eSignature?: IESignature | null } | null | undefined
): boolean => {
  if (!isElectronicallySigned(doc)) return false;
  res.status(409).json({ success: false, message: SIGNED_DOCUMENT_LOCKED_MESSAGE });
  return true;
};
