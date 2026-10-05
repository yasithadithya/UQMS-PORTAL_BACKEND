import { Request, Response } from 'express';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { IESignature } from '../models/ESignature';
import { applyAnnotations, getAnnotationItems } from './annotationService';
import { audit } from './auditService';
import { setContextSystem } from '../middleware/requestContext';
import type { AuthRequest } from '../middleware/auth';

/**
 * Deliverable control: until the responsible surveyor signs a deliverable it can only be
 * previewed. Unsigned PDFs are served inline with a PREVIEW watermark, download requests are
 * refused, and the public QR link does not resolve. Once signed, the clean PDF is served and
 * `?download=1` returns it as an attachment. Saved annotations (certified stamp, strike-offs,
 * crosses, text) are drawn on every copy, except `?annotations=0`, which the editor uses to draw
 * them itself.
 */

export const isSigned = (doc: { eSignature?: IESignature | null } | null | undefined): boolean =>
  Boolean(doc?.eSignature?.signedAt);

export const PREVIEW_ONLY_MESSAGE = 'This document is preview only until the responsible surveyor signs it.';

const wantsDownload = (req: Request): boolean => req.query.download === '1' || req.query.download === 'true';

/** Stamps a diagonal "PREVIEW – NOT SIGNED" watermark on every page. */
export const watermarkPreview = async (buffer: Buffer): Promise<Buffer> => {
  const pdf = await PDFDocument.load(buffer);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = 'PREVIEW - NOT SIGNED';
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(width, height) / 11;
    const textWidth = font.widthOfTextAtSize(text, size);
    // Centre the rotated text: offset the start point back along the 45° diagonal.
    const offset = textWidth / 2 / Math.SQRT2;
    page.drawText(text, {
      x: width / 2 - offset + size / 4,
      y: height / 2 - offset - size / 4,
      size,
      font,
      color: rgb(0.85, 0.1, 0.1),
      opacity: 0.18,
      rotate: degrees(45),
    });
  }
  return Buffer.from(await pdf.save());
};

/** The stored PDF with the document's saved annotations drawn on it. */
export const withAnnotations = async (buffer: Buffer, docType: string, docId: string): Promise<Buffer> =>
  applyAnnotations(buffer, await getAnnotationItems(docType, docId));

/**
 * Sends a deliverable PDF to an authenticated user, applying the preview/download rules.
 * `annotationsFor` names the document whose saved annotations are drawn on the PDF; it (or
 * `record`) also names the document the view or download is recorded against in the audit log.
 */
export const sendDeliverablePdf = async (
  req: Request,
  res: Response,
  {
    buffer,
    filename,
    signed,
    annotationsFor,
    record,
  }: {
    buffer: Buffer;
    filename: string;
    signed: boolean;
    annotationsFor?: { docType: string; docId: string };
    record?: { docType: string; docId: string };
  }
): Promise<void> => {
  const download = wantsDownload(req);
  if (!signed && download) {
    res.status(403).json({ success: false, message: PREVIEW_ONLY_MESSAGE });
    return;
  }

  const target = record ?? annotationsFor;
  if (target) {
    await audit.event({
      action: signed && download ? 'document.download' : 'document.view',
      entityType: target.docType,
      entityId: target.docId,
      metadata: { file: filename, ...(signed ? {} : { preview: true }) },
    }, req as AuthRequest);
  }

  let body = buffer;
  if (annotationsFor && req.query.annotations !== '0') {
    body = await withAnnotations(body, annotationsFor.docType, annotationsFor.docId);
  }
  if (!signed) body = await watermarkPreview(body);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${signed && download ? 'attachment' : 'inline'}; filename="${filename}"`);
  if (!signed) res.setHeader('Cache-Control', 'no-store');
  res.send(body);
};

/** Plain-text reply for public QR links to deliverables that are not signed yet. */
export const rejectUnsignedPublicPdf = (res: Response): void => {
  res.status(403).type('text/plain').send(`${PREVIEW_ONLY_MESSAGE} It cannot be viewed through this link yet.`);
};

/**
 * Public QR links normally redirect to the stored PDF. When the document has annotations the
 * annotated copy is streamed instead, so the link shows what was signed.
 * Returns true when it has responded.
 */
export const sendAnnotatedPublicPdf = async (
  res: Response,
  docType: string,
  docId: string,
  loadBuffer: () => Promise<Buffer | null>
): Promise<boolean> => {
  const items = await getAnnotationItems(docType, docId);
  if (items.length === 0) return false;
  const buffer = await loadBuffer();
  if (!buffer) return false;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.send(await applyAnnotations(buffer, items));
  return true;
};

/** Records that a deliverable was opened through its public QR link (no signed-in user). */
export const recordPublicView = (docType: string, docId: string): Promise<void> => {
  setContextSystem('public QR link');
  return audit.event({ action: 'document.view', entityType: docType, entityId: docId, metadata: { via: 'public QR link' } });
};
