import fs from 'fs';
import path from 'path';
import { formatDate } from '../utils/date';
import { DocumentTemplateDetails } from './documentTemplateService';

/**
 * Letterhead, footer and shared styling for the controlled-document PDFs
 * (Request for Survey, Docking Statement, Record of Equipment & Survey Report, SCCCOS).
 */

type PdfDoc = PDFKit.PDFDocument;

export const HEADING_COLOR = '#000000';
const BRAND_GOLD = '#a8834f';
const BRAND_GOLD_TINT = '#f6f0e6';
const BORDER_COLOR = '#d9cbb3';
const MUTED_COLOR = '#8a8f98';

/** Space kept free at the bottom of every page for the controlled document footer. */
export const FOOTER_RESERVED_HEIGHT = 30;

/** Resolves a file in src/public for both ts-node and the build output. */
const resolvePublicAsset = (filename: string): string | null => {
  const candidates = [
    path.join(__dirname, '../public', filename),
    path.join(__dirname, '../../src/public', filename),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const LOGO_PATH = resolvePublicAsset('sign_logo.png');
// sign_logo.png is a 2382px square with wide transparent margins; this is the drawn mark.
const LOGO_SOURCE_SIZE = 2382;
const LOGO_CONTENT = { x: 434, y: 588, width: 1643, height: 1033 };

/** Draws the logo scaled to fit the box, cropped to its visible content and centred. */
const drawLogo = (doc: PdfDoc, x: number, y: number, width: number, height: number) => {
  if (!LOGO_PATH) {
    console.warn('Logo image not found: sign_logo.png');
    return;
  }

  const scale = Math.min(width / LOGO_CONTENT.width, height / LOGO_CONTENT.height);
  const drawnWidth = LOGO_CONTENT.width * scale;
  const drawnHeight = LOGO_CONTENT.height * scale;
  const contentX = x + (width - drawnWidth) / 2;
  const contentY = y + (height - drawnHeight) / 2;

  try {
    doc.save();
    doc.rect(contentX, contentY, drawnWidth, drawnHeight).clip();
    doc.image(LOGO_PATH, contentX - LOGO_CONTENT.x * scale, contentY - LOGO_CONTENT.y * scale, {
      width: LOGO_SOURCE_SIZE * scale,
    });
    doc.restore();
  } catch (err) {
    doc.restore();
    console.warn('Could not load logo image:', err);
  }
};

/**
 * Draws the page-one letterhead: logo, company name and document title, and the
 * controlled document details box. Returns the y position below it.
 */
export const drawLetterhead = (
  doc: PdfDoc,
  options: { title: string; template: DocumentTemplateDetails; margin: number }
): number => {
  const { title, template, margin } = options;
  const left = margin;
  const top = margin;
  const width = doc.page.width - margin * 2;
  const rowHeight = 17;
  const height = rowHeight * 4;

  const logoWidth = 95;
  const labelWidth = 72;
  const valueWidth = 98;
  const tableX = left + width - labelWidth - valueWidth;
  const titleX = left + logoWidth;
  const titleWidth = tableX - titleX;

  doc.save();
  doc.lineWidth(0.75).strokeColor(BORDER_COLOR);

  // Details box: gold label cells on a tinted fill, values in black
  const rows = [
    ['Document No.', template.documentNumber],
    ['Revision No.', template.revision],
    ['Effective Date', formatDate(template.effectiveDate)],
    ['Approved By', template.approvedBy],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = top + index * rowHeight;
    doc.rect(tableX, rowY, labelWidth, rowHeight).fillAndStroke(BRAND_GOLD_TINT, BORDER_COLOR);
    doc.rect(tableX + labelWidth, rowY, valueWidth, rowHeight).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND_GOLD)
      .text(label, tableX + 5, rowY + 5, { width: labelWidth - 10, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor('#000000')
      .text(value || '-', tableX + labelWidth + 5, rowY + 5, { width: valueWidth - 10, lineBreak: false, ellipsis: true });
  });

  // Logo and title cells
  doc.rect(left, top, logoWidth, height).stroke();
  doc.rect(titleX, top, titleWidth, height).stroke();
  doc.restore();

  drawLogo(doc, left + 6, top + 6, logoWidth - 12, height - 12);

  const companyName = 'UNIVERSAL QUALITY MANAGEMENT SYSTEMS';
  const textWidth = titleWidth - 16;
  doc.font('Helvetica-Bold').fontSize(8);
  const companyHeight = doc.heightOfString(companyName, { width: textWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15);
  const titleHeight = doc.heightOfString(title, { width: textWidth, align: 'center' });
  const gap = 4;
  const textTop = top + Math.max(4, (height - companyHeight - gap - titleHeight) / 2);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED_COLOR)
    .text(companyName, titleX + 8, textTop, { width: textWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(BRAND_GOLD)
    .text(title, titleX + 8, textTop + companyHeight + gap, { width: textWidth, align: 'center' });

  doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);
  return top + height + 16;
};

/**
 * Draws the controlled document footer on every buffered page:
 * "Controlled Document - UQMS" | document number and revision | page number.
 * Must be called after all content, and stays inside the page bounds so PDFKit never adds a page.
 */
export const drawControlledFooter = (
  doc: PdfDoc,
  options: { template: DocumentTemplateDetails; margin: number }
) => {
  const { template, margin } = options;
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);

    const width = doc.page.width - margin * 2;
    const textY = doc.page.height - margin - 12;
    // Text drawn below the bottom margin would otherwise trigger an automatic page break.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.save();
    doc.moveTo(margin, textY - 6).lineTo(margin + width, textY - 6).lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();
    doc.restore();

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED_COLOR);
    doc.text('Controlled Document - UQMS', margin, textY, { width, align: 'left', lineBreak: false });
    doc.text(`${template.documentNumber} | Rev. ${template.revision}`, margin, textY, { width, align: 'center', lineBreak: false });
    doc.text(`Page ${i + 1} of ${totalPages}`, margin, textY, { width, align: 'right', lineBreak: false });

    doc.page.margins.bottom = bottomMargin;
  }

  doc.fillColor('#000000');
};

/** Height the additional remarks section will take; 0 when there are no remarks. */
export const measureAdditionalRemarks = (doc: PdfDoc, remarks: string | undefined, width: number): number => {
  const text = remarks?.trim();
  if (!text) return 0;
  doc.font('Helvetica').fontSize(9.5);
  return 16 + doc.heightOfString(text, { width, lineGap: 2 }) + 14;
};

/** Draws the "ADDITIONAL REMARKS" section and returns the y below it; draws nothing when empty. */
export const drawAdditionalRemarks = (
  doc: PdfDoc,
  remarks: string | undefined,
  x: number,
  y: number,
  width: number
): number => {
  const text = remarks?.trim();
  if (!text) return y;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(HEADING_COLOR).text('ADDITIONAL REMARKS', x, y);
  doc.font('Helvetica').fontSize(9.5).fillColor('#111827').text(text, x, y + 16, { width, lineGap: 2 });
  return doc.y + 14;
};
