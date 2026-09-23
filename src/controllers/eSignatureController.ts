import { Request, Response } from 'express';
import mongoose from 'mongoose';
import UserModel from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { E_SIGNATURE_BYPASS_ROLES, E_SIGNATURE_CIRCULAR_REF, E_SIGNATURE_COMPANY_NAME } from '../config/eSignature';
import {
  SignableDocumentHandler,
  assignedSurveyorIds,
  getSignableDocument,
  isAssignedSurveyor,
} from '../services/signableDocuments';
import { isElectronicallySigned } from '../services/eSignatureLock';
import { convertFullNameToInitials } from './surveyReportController';

const MAX_LOCATION_LENGTH = 120;
const NOT_ASSIGNED_MESSAGE = 'Only a surveyor assigned to this survey can sign this document.';

const roleNameOf = (req: AuthRequest): string => {
  const role = req.user?.role as unknown;
  const roleName = role && typeof role === 'object' ? (role as { roleName?: string }).roleName : role;
  return typeof roleName === 'string' ? roleName.trim().toLowerCase() : '';
};

/** Admin and UQMS admin may sign any document on the assigned surveyor's behalf, and revoke signatures. */
const hasSigningBypass = (req: AuthRequest): boolean => E_SIGNATURE_BYPASS_ROLES.includes(roleNameOf(req));

type Signer = { id: string; name: string; isSelf: boolean };

const displayName = (user: { nameWithInitials?: string; fullName?: string; username?: string }): string =>
  (user.nameWithInitials || convertFullNameToInitials(user.fullName || '') || user.username || '').trim();

/**
 * Whose details the stamp can carry. An assigned surveyor signs as themselves; a bypass role
 * signs as one of the assigned surveyors (most recent visit first), or as themselves when
 * nobody is assigned yet. Empty when the user may not sign.
 */
const signerOptionsFor = async (req: AuthRequest, booking: any, userId: string): Promise<Signer[]> => {
  let ids: string[];
  if (hasSigningBypass(req)) {
    const assigned = assignedSurveyorIds(booking);
    ids = assigned.length > 0 ? [...assigned].sort((a, b) => Number(b === userId) - Number(a === userId)) : [userId];
  } else if (isAssignedSurveyor(booking, userId)) {
    ids = [userId];
  } else {
    return [];
  }

  const users = await UserModel.find({ _id: { $in: ids } }).select('nameWithInitials fullName username');
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return ids
    .map((id) => ({ id, name: byId.has(id) ? displayName(byId.get(id)!) : '', isSelf: id === userId }))
    .filter((signer) => signer.name);
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
  const signerOptions = signed ? [] : await signerOptionsFor(req, booking, userId);
  const notSignableReason = handler.notSignableReason(doc);

  let reason: string | null = null;
  if (signed) reason = 'This document has already been signed.';
  else if (notSignableReason) reason = notSignableReason;
  else if (signerOptions.length === 0) reason = NOT_ASSIGNED_MESSAGE;

  return {
    documentLabel: handler.label,
    signed,
    eSignature: signed ? doc.eSignature : null,
    signatureField: handler.signatureField(doc) || null,
    canSign: reason === null,
    canRevoke: signed && hasSigningBypass(req),
    reason,
    preview: signed
      ? null
      : {
          signerName: signerOptions[0]?.name || '',
          signerOptions,
          companyName: E_SIGNATURE_COMPANY_NAME,
          circularRef: E_SIGNATURE_CIRCULAR_REF,
          location: await handler.defaultLocation(doc, booking, signerOptions[0]?.id || userId),
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
 * Electronically sign a document, then re-render its PDF with the stamp.
 * Assigned surveyors sign as themselves; bypass roles sign with an assigned surveyor's details.
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
    const signerOptions = await signerOptionsFor(req as AuthRequest, booking, userId);
    if (signerOptions.length === 0) {
      const isAllowed = hasSigningBypass(req as AuthRequest) || isAssignedSurveyor(booking, userId);
      res.status(isAllowed ? 400 : 403).json({
        success: false,
        message: isAllowed ? 'The surveyor has no name to sign with. Update the user profile first.' : NOT_ASSIGNED_MESSAGE,
      });
      return;
    }

    const requestedSignerId = typeof req.body?.signerId === 'string' ? req.body.signerId : '';
    const signer = requestedSignerId ? signerOptions.find((option) => option.id === requestedSignerId) : signerOptions[0];
    if (!signer) {
      res.status(403).json({ success: false, message: 'You cannot sign this document on behalf of the selected surveyor.' });
      return;
    }

    const requestedLocation = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
    const location = requestedLocation || (await handler.defaultLocation(doc, booking, signer.id));
    if (!location) {
      res.status(400).json({ success: false, message: 'Signing location is required.' });
      return;
    }
    if (location.length > MAX_LOCATION_LENGTH) {
      res.status(400).json({ success: false, message: `Signing location must be at most ${MAX_LOCATION_LENGTH} characters.` });
      return;
    }

    const eSignature = {
      signedBy: signer.id,
      signedByName: signer.name,
      ...(signer.isSelf ? {} : { appliedBy: userId }),
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
 * Revoke a document's electronic signature (admin / UQMS admin only), unlocking it and re-rendering an unsigned PDF.
 */
export const revokeSignature = async (req: Request, res: Response): Promise<void> => {
  try {
    const resolved = resolveRequest(req as AuthRequest, res);
    if (!resolved) return;
    const { handler, id, userId } = resolved;

    if (!hasSigningBypass(req as AuthRequest)) {
      res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
      return;
    }

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
