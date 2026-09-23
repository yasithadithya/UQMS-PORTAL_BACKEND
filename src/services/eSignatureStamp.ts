import { IESignature, ISignatureField } from '../models/ESignature';
import { E_SIGNATURE_SURVEYOR_CAPTION, resolveSealPath } from '../config/eSignature';
import { getIstDateParts } from '../utils/date';

/**
 * Electronic signature stamp for pdfkit documents.
 *
 * Layout (points), matching the IMO-style electronic signature stamp:
 *
 *   [seal]  For <company>
 *           Electronically Signed By: <name>
 *           Location: <location>
 *           Signing Date: dd/mm/yyyy (dd/mm/yyyy)
 *           Signed Electronically in accordance
 *           with <circular>
 *           ___________________________________
 *           Surveyor to <company>
 *
 * Unsigned PDFs get only the line and caption; the area above the line is the
 * clickable signature field the frontend overlays.
 */

const FIELD_WIDTH = 400;
const STAMP_HEIGHT = 80;
const SEAL_SIZE = 72;
const TEXT_OFFSET = SEAL_SIZE + 12;
const LINE_HEIGHT = 11;
const STAMP_FONT_SIZE = 9;
const MIN_STAMP_FONT_SIZE = 6.5;

/** Total vertical space the signature block occupies, including the line and caption. */
export const SIGNATURE_BLOCK_HEIGHT = STAMP_HEIGHT + 24;

/** Signing dates are shown as dd/mm/yyyy, as the stamp states the format explicitly. */
export const formatSigningDate = (value: Date): string => {
  const { day, month, year } = getIstDateParts(value);
  return `${day}/${month}/${year}`;
};

const currentPageIndex = (doc: PDFKit.PDFDocument): number => {
  const range = doc.bufferedPageRange();
  return range.start + range.count - 1;
};

/** Draws one stamp line, shrinking the font so long names or locations stay on one line. */
const drawFittedLine = (doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number): void => {
  let size = STAMP_FONT_SIZE;
  doc.font('Helvetica-Oblique').fontSize(size);
  while (size > MIN_STAMP_FONT_SIZE && doc.widthOfString(text) > width) {
    size -= 0.25;
    doc.fontSize(size);
  }
  doc.text(text, x, y, { width, lineBreak: false });
};

/**
 * Reserves the signature field at (x, y) on the current page and draws the
 * signature line and caption beneath it. Callers make sure SIGNATURE_BLOCK_HEIGHT fits.
 */
export const reserveSignatureField = (doc: PDFKit.PDFDocument, x: number, y: number): ISignatureField => {
  const textX = x + TEXT_OFFSET;
  const textWidth = FIELD_WIDTH - TEXT_OFFSET;
  const lineY = y + STAMP_HEIGHT;

  doc
    .moveTo(textX, lineY)
    .lineTo(x + FIELD_WIDTH, lineY)
    .lineWidth(0.75)
    .strokeColor('#111827')
    .stroke()
    .lineWidth(1)
    .strokeColor('#000000');

  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#111827')
    .text(E_SIGNATURE_SURVEYOR_CAPTION, textX, lineY + 5, { width: textWidth + 20, lineBreak: false });

  return {
    page: currentPageIndex(doc),
    x,
    y,
    width: FIELD_WIDTH,
    height: STAMP_HEIGHT,
    pageWidth: doc.page.width,
    pageHeight: doc.page.height,
  };
};

/** Draws the signature stamp (seal and signing details) inside a reserved field. */
export const drawESignatureStamp = (
  doc: PDFKit.PDFDocument,
  field: ISignatureField,
  signature: IESignature
): void => {
  const sealPath = resolveSealPath();
  if (sealPath) {
    try {
      doc.image(sealPath, field.x, field.y + (STAMP_HEIGHT - SEAL_SIZE) / 2, {
        fit: [SEAL_SIZE, SEAL_SIZE],
        align: 'center',
        valign: 'center',
      });
    } catch (err) {
      console.warn('Could not draw e-signature seal image:', err);
    }
  }

  const textX = field.x + TEXT_OFFSET;
  const textWidth = field.width - TEXT_OFFSET;
  const signingDate = formatSigningDate(new Date(signature.signedAt));
  const lines = [
    `For ${signature.companyName}`,
    `Electronically Signed By: ${signature.signedByName}`,
    `Location: ${(signature.location || '-').toUpperCase()}`,
    `Signing Date: ${signingDate} (dd/mm/yyyy)`,
    'Signed Electronically in accordance',
    `with ${signature.circularRef}`,
  ];

  const startY = field.y + (STAMP_HEIGHT - lines.length * LINE_HEIGHT) / 2;
  doc.fillColor('#1f2937');
  lines.forEach((line, index) => drawFittedLine(doc, line, textX, startY + index * LINE_HEIGHT, textWidth));
  doc.fillColor('#000000');
};

/**
 * Reserves the signature field and, when the document is signed, stamps it.
 * Returns the field so it can be stored with the PDF.
 */
export const drawSignatureBlock = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  signature?: IESignature | null
): ISignatureField => {
  const field = reserveSignatureField(doc, x, y);
  if (signature?.signedAt) {
    drawESignatureStamp(doc, field, signature);
  }
  return field;
};

/** A generated PDF and the position of its signature field, if it has one. */
export type GeneratedPdf = {
  buffer: Buffer;
  signatureField: ISignatureField | null;
};
