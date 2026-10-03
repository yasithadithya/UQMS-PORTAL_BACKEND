import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import DocumentAnnotation, { ANNOTATION_TYPES, AnnotationType, IAnnotationItem } from '../models/DocumentAnnotation';
import { formatSigningDate } from './eSignatureStamp';

/** Document types whose PDFs can carry a "Certified" stamp (the SSC Certificate of Survey). */
export const COS_DOC_TYPES = new Set(['scccos']);

const RED = rgb(0.78, 0.08, 0.08);
const INK = rgb(0.05, 0.15, 0.45);
const STAMP_BLUE = rgb(0.08, 0.22, 0.6);

export class AnnotationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isFraction = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Validates and cleans the items sent by the viewer. */
export const cleanAnnotationItems = (raw: unknown, docType: string, pageCount?: number): IAnnotationItem[] => {
  if (!Array.isArray(raw)) throw new AnnotationError(400, 'Annotations must be a list.');
  if (raw.length > 200) throw new AnnotationError(400, 'A document can have at most 200 annotations.');

  return raw.map((item: any, index): IAnnotationItem => {
    const at = `Annotation ${index + 1}`;
    const type = item?.type as AnnotationType;
    if (!ANNOTATION_TYPES.includes(type)) throw new AnnotationError(400, `${at}: unknown type.`);
    if (type === 'cos-stamp' && !COS_DOC_TYPES.has(docType)) {
      throw new AnnotationError(400, 'The certified stamp can only be used on a Certificate of Survey.');
    }
    const page = Number(item.page);
    if (!Number.isInteger(page) || page < 0 || (pageCount !== undefined && page >= pageCount)) {
      throw new AnnotationError(400, `${at}: page is out of range.`);
    }
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      if (!isFraction(item[key])) throw new AnnotationError(400, `${at}: ${key} must be between 0 and 1.`);
    }

    const cleaned: IAnnotationItem = { type, page, x: item.x, y: item.y, width: item.width, height: item.height };
    if (type === 'text') {
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) throw new AnnotationError(400, `${at}: text is empty.`);
      if (text.length > 500) throw new AnnotationError(400, `${at}: text is longer than 500 characters.`);
      const fontSize = item.fontSize === undefined ? 11 : Number(item.fontSize);
      if (!Number.isFinite(fontSize) || fontSize < 6 || fontSize > 36) throw new AnnotationError(400, `${at}: font size must be 6–36.`);
      cleaned.text = text;
      cleaned.fontSize = fontSize;
    }
    if (type === 'cos-stamp') {
      cleaned.text = typeof item.text === 'string' ? item.text.trim().slice(0, 120) : undefined;
      const stampedAt = item.stampedAt ? new Date(item.stampedAt) : new Date();
      cleaned.stampedAt = Number.isNaN(stampedAt.getTime()) ? new Date() : stampedAt;
    }
    return cleaned;
  });
};

export const getAnnotationItems = async (docType: string, docId: string): Promise<IAnnotationItem[]> => {
  const record = await DocumentAnnotation.findOne({ docType, docId }).select('items').lean();
  return record?.items ?? [];
};

/** Writes multi-line text downwards from its top edge. */
const drawLines = (page: PDFPage, font: PDFFont, lines: string[], x: number, topY: number, size: number, color = INK) => {
  lines.forEach((line, i) => {
    page.drawText(line, { x, y: topY - size * (i + 1) - i * size * 0.2, size, font, color });
  });
};

/** Keeps characters the standard PDF fonts can encode (WinAnsi), replacing the rest. */
const encodable = (font: PDFFont, text: string): string =>
  Array.from(text)
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '?';
      }
    })
    .join('');

const drawCosStamp = (page: PDFPage, fonts: { bold: PDFFont; regular: PDFFont }, item: IAnnotationItem, box: { x: number; y: number; w: number; h: number }) => {
  const { x, y, w, h } = box;
  page.drawRectangle({ x, y, width: w, height: h, borderColor: STAMP_BLUE, borderWidth: 2, opacity: 0, borderOpacity: 0.9 });
  page.drawRectangle({ x: x + 3, y: y + 3, width: w - 6, height: h - 6, borderColor: STAMP_BLUE, borderWidth: 0.75, opacity: 0, borderOpacity: 0.9 });

  const title = 'CERTIFIED';
  let titleSize = Math.min(h * 0.34, 22);
  while (titleSize > 6 && fonts.bold.widthOfTextAtSize(title, titleSize) > w - 14) titleSize -= 0.5;
  page.drawText(title, {
    x: x + (w - fonts.bold.widthOfTextAtSize(title, titleSize)) / 2,
    y: y + h - 6 - titleSize,
    size: titleSize,
    font: fonts.bold,
    color: STAMP_BLUE,
    opacity: 0.95,
  });

  const details = [
    'Universal Quality Management Systems (Pvt) Ltd',
    [item.text, item.stampedAt ? formatSigningDate(new Date(item.stampedAt)) : ''].filter(Boolean).join(' - '),
  ].filter(Boolean).map((line) => encodable(fonts.regular, line));
  let size = Math.min(h * 0.14, 8);
  while (size > 4 && details.some((line) => fonts.regular.widthOfTextAtSize(line, size) > w - 12)) size -= 0.25;
  details.forEach((line, i) => {
    page.drawText(line, {
      x: x + (w - fonts.regular.widthOfTextAtSize(line, size)) / 2,
      y: y + 6 + (details.length - 1 - i) * (size + 2),
      size,
      font: fonts.regular,
      color: STAMP_BLUE,
      opacity: 0.95,
    });
  });
};

/** Draws the annotations onto the PDF (stamps, strike-offs, crosses and text). */
export const applyAnnotations = async (buffer: Buffer, items: IAnnotationItem[]): Promise<Buffer> => {
  if (items.length === 0) return buffer;
  const pdf = await PDFDocument.load(buffer);
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const pages = pdf.getPages();

  for (const item of items) {
    const page = pages[item.page];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    // Fractions from the top-left → PDF points from the bottom-left.
    const box = { x: item.x * pw, w: item.width * pw, h: item.height * ph, y: ph - item.y * ph - item.height * ph };

    switch (item.type) {
      case 'strike':
        page.drawLine({ start: { x: box.x, y: box.y + box.h / 2 }, end: { x: box.x + box.w, y: box.y + box.h / 2 }, thickness: 1.5, color: RED });
        break;
      case 'cross':
        page.drawLine({ start: { x: box.x, y: box.y }, end: { x: box.x + box.w, y: box.y + box.h }, thickness: 1.5, color: RED });
        page.drawLine({ start: { x: box.x, y: box.y + box.h }, end: { x: box.x + box.w, y: box.y }, thickness: 1.5, color: RED });
        break;
      case 'text': {
        const size = item.fontSize ?? 11;
        const lines = (item.text ?? '').split(/\r?\n/).map((line) => encodable(fonts.regular, line));
        drawLines(page, fonts.regular, lines, box.x, box.y + box.h, size);
        break;
      }
      case 'cos-stamp':
        drawCosStamp(page, fonts, item, box);
        break;
    }
  }
  return Buffer.from(await pdf.save());
};
