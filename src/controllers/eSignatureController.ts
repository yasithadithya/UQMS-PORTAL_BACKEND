import { Request, Response } from 'express';
import mongoose from 'mongoose';
import UserModel from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { E_SIGNATURE_CIRCULAR_REF, E_SIGNATURE_COMPANY_NAME } from '../config/eSignature';
import { SignableDocumentHandler, getSignableDocument, isAssignedSurveyor } from '../services/signableDocuments';
import { isElectronicallySigned } from '../services/eSignatureLock';
import { convertFullNameToInitials } from './surveyReportController';

const MAX_LOCATION_LENGTH = 120;

const isAdmin = (req: AuthRequest): boolean => {
  const role = req.user?.role as unknown;
  const roleName = role && typeof role === 'object' ? (role as { roleName?: string }).roleName : role;
  return typeof roleName === 'string' && roleName.toLowerCase() === 'admin';
};

const signerNameFor = async (userId: string): Promise<string> => {
  const user = await UserModel.findById(userId).select('nameWithInitials fullName username');
  if (!user) return '';
  return (user.nameWithInitials || convertFullNameToInitials(user.fullName || '') || user.username || '').trim();
};

type ResolvedRequest = { handler: SignableDocumentHandler; id: string; userId: string };

/** Validates the doc type, id and user; sends the error response and returns null when invalid. */
const resolveRequest = (req: AuthRequest, res: Response): ResolvedRequest | null => {
  const handler = getSignableDocument(String(req.params.docType));
  const id = String(req.params.id);
  const userId = req.user?.id;

  if (!handler) {
    res.status(404).json({ success: false, message: 'Unknown document type.' });
    return null;
  }
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    return null;
  }
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return null;
  }
  return { handler, id, userId };
};

/** Builds the signature status the viewer needs to render the signature field. */
const buildStatus = async (req: AuthRequest, handler: SignableDocumentHandler, doc: any, userId: string) => {
  const signed = isElectronicallySigned(doc);
  const booking = await handler.loadBooking(doc);
  const assigned = isAssignedSurveyor(booking, userId);
  const notSignableReason = handler.notSignableReason(doc);

  let reason: string | null = null;
  if (signed) reason = 'This document has already been signed.';
  else if (notSignableReason) reason = notSignableReason;
  else if (!assigned) reason = 'Only a surveyor assigned to this survey can sign this document.';

  return {
    documentLabel: handler.label,
    signed,
    eSignature: signed ? doc.eSignature : null,
    signatureField: handler.signatureField(doc) || null,
    canSign: reason === null,
    canRevoke: signed && isAdmin(req),
    reason,
    preview: signed
      ? null
      : {
          signerName: await signerNameFor(userId),
          companyName: E_SIGNATURE_COMPANY_NAME,
          circularRef: E_SIGNATURE_CIRCULAR_REF,
          location: await handler.defaultLocation(doc, booking, userId),
        },
  };
};

/**
 * Get the electronic signature status of a document.
 * Older PDFs generated before signature fields existed are re-rendered so the field can be located.
 */
export const getSignatureStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const resolved = resolveRequest(req as AuthRequest, res);
    if (!resolved) return;
    const { handler, id, userId } = resolved;

    let doc = await handler.model.findById(id);
    if (!doc) {
      res.status(404).json({ success: false, message: `${handler.label} not found.` });
      return;
    }

    const needsField = !isElectronicallySigned(doc) && !handler.signatureField(doc);
    const canRender = handler.rendersPdfOnDemand || handler.hasStoredPdf(doc);
    if (needsField && canRender) {
      await handler.regeneratePdf(req, id);
      doc = await handler.model.findById(id);
    }

    res.status(200).json({ success: true, data: await buildStatus(req as AuthRequest, handler, doc, userId) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error retrieving signature status.', error: error.message });
  }
};

/**
 * Electronically sign a document as the logged-in assigned surveyor, then re-render its PDF with the stamp.
 */
export const signDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const resolved = resolveRequest(req as AuthRequest, res);
    if (!resolved) return;
    const { handler, id, userId } = resolved;

    const doc = await handler.model.findById(id);
    if (!doc) {
      res.status(404).json({ success: false, message: `${handler.label} not found.` });
      return;
    }
    if (isElectronicallySigned(doc)) {
      res.status(409).json({ success: false, message: 'This document has already been signed.' });
      return;
    }

    const notSignableReason = handler.notSignableReason(doc);
    if (notSignableReason) {
      res.status(400).json({ success: false, message: notSignableReason });
      return;
    }

    const booking = await handler.loadBooking(doc);
    if (!isAssignedSurveyor(booking, userId)) {
      res.status(403).json({ success: false, message: 'Only a surveyor assigned to this survey can sign this document.' });
      return;
    }

    const signerName = await signerNameFor(userId);
    if (!signerName) {
      res.status(400).json({ success: false, message: 'Your profile has no name to sign with. Update your profile first.' });
      return;
    }

    const requestedLocation = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
    const location = requestedLocation || (await handler.defaultLocation(doc, booking, userId));
    if (!location) {
      res.status(400).json({ success: false, message: 'Signing location is required.' });
      return;
    }
    if (location.length > MAX_LOCATION_LENGTH) {
      res.status(400).json({ success: false, message: `Signing location must be at most ${MAX_LOCATION_LENGTH} characters.` });
      return;
    }

    const eSignature = {
      signedBy: userId,
      signedByName: signerName,
      companyName: E_SIGNATURE_COMPANY_NAME,
      location,
      circularRef: E_SIGNATURE_CIRCULAR_REF,
      signedAt: new Date(),
    };

    // Conditional update so two concurrent signings cannot both succeed.
    const result = await handler.model.updateOne(
      { _id: id, 'eSignature.signedAt': { $exists: false } },
      { $set: { eSignature, updatedBy: userId } }
    );
    if (result.modifiedCount === 0) {
      res.status(409).json({ success: false, message: 'This document has already been signed.' });
      return;
    }

    try {
      await handler.regeneratePdf(req, id);
    } catch (renderError) {
      // Without the stamped PDF the signature is not visible anywhere, so undo it.
      await handler.model.updateOne({ _id: id }, { $unset: { eSignature: 1 } });
      throw renderError;
    }

    const signedDoc = await handler.model.findById(id);
    res.status(200).json({
      success: true,
      message: `${handler.label} signed electronically.`,
      data: await buildStatus(req as AuthRequest, handler, signedDoc, userId),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error signing document.', error: error.message });
  }
};

/**
 * Revoke a document's electronic signature (admin only), unlocking it and re-rendering an unsigned PDF.
 */
export const revokeSignature = async (req: Request, res: Response): Promise<void> => {
  try {
    const resolved = resolveRequest(req as AuthRequest, res);
    if (!resolved) return;
    const { handler, id, userId } = resolved;

    const doc = await handler.model.findById(id);
    if (!doc) {
      res.status(404).json({ success: false, message: `${handler.label} not found.` });
      return;
    }
    if (!isElectronicallySigned(doc)) {
      res.status(400).json({ success: false, message: 'This document is not signed.' });
      return;
    }

    await handler.model.updateOne({ _id: id }, { $unset: { eSignature: 1 }, $set: { updatedBy: userId } });
    await handler.regeneratePdf(req, id);

    const unsignedDoc = await handler.model.findById(id);
    res.status(200).json({
      success: true,
      message: 'Electronic signature revoked.',
      data: await buildStatus(req as AuthRequest, handler, unsignedDoc, userId),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error revoking signature.', error: error.message });
  }
};
