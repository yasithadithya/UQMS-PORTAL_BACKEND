import PDFDocument from 'pdfkit';
import { formatDate } from '../utils/date';
import { DOCUMENT_TEMPLATE_NAMES, getDocumentTemplate } from './documentTemplateService';
import { FOOTER_RESERVED_HEIGHT, drawControlledFooter, drawLetterhead } from './pdfLayout';
import type { IQuotationClient, IQuotationLineItem } from '../models/Quotation';

type QuotationLike = {
  quotationNumber: string;
  quotationDate: Date;
  jobNumber?: string;
  requestNumber: string;
  title: string;
  client: IQuotationClient;
  exchangeRate: number;
  lineItems: IQuotationLineItem[];
  totalLkr: number;
  notes: string[];
  paymentTerms: string[];
  preparedByName?: string;
  preparedByDesignation?: string;
};

/** Printed on every quotation so the client can pay the advance. */
export const QUOTATION_BANK_DETAILS: [string, string][] = [
  ['ACCOUNT NAME', 'UQMS (PVT) LTD.'],
  ['BANK', 'COMMERCIAL BANK OF CEYLON PLC, SRI LANKA'],
  ['BRANCH', 'COLOMBO 07 BRANCH (CODE 7056)'],
  ['SWIFT CODE', 'CCEYLKLX'],
  ['CURRENCY', 'LKR'],
  ['ACCOUNT NUMBER', '8028327031'],
];

const COMPANY_NAME = 'UNIVERSAL QUALITY MANAGEMENT SYSTEMS (PVT) LTD';
const PAGE_MARGIN = 40;
const GOLD = '#a8834f';
const GOLD_TINT = '#f6f0e6';
const HEADER_TINT = '#fdf3d8';
const BORDER = '#000000';

const money = (value: number): string =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rates print without trailing zeros (450, 328.13), as on the paper quotations. */
const rateText = (value: number): string => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

type Cell = { text: string; width: number; align?: 'left' | 'center' | 'right'; bold?: boolean; fill?: string };

/** Draws one row of bordered cells at (x, y) and returns the y below it. Text is vertically centred. */
const drawRow = (doc: PDFKit.PDFDocument, x: number, y: number, cells: Cell[], minHeight = 22): number => {
  const padding = 6;
  let height = minHeight;
  cells.forEach((cell) => {
    doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
    height = Math.max(height, doc.heightOfString(cell.text || ' ', { width: cell.width - padding * 2 }) + padding * 2);
  });

  let cx = x;
  cells.forEach((cell) => {
    doc.save().lineWidth(0.75).strokeColor(BORDER);
    if (cell.fill) doc.rect(cx, y, cell.width, height).fillAndStroke(cell.fill, BORDER);
    else doc.rect(cx, y, cell.width, height).stroke();
    doc.restore();

    doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor('#000000');
    const textHeight = doc.heightOfString(cell.text || ' ', { width: cell.width - padding * 2 });
    doc.text(cell.text, cx + padding, y + (height - textHeight) / 2, {
      width: cell.width - padding * 2,
      align: cell.align ?? 'left',
    });
    cx += cell.width;
  });
  return y + height;
};

export const createQuotationPdfBuffer = async (quotation: QuotationLike): Promise<Buffer> => {
  const template = await getDocumentTemplate(DOCUMENT_TEMPLATE_NAMES.quotation);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PAGE_MARGIN;
    const width = doc.page.width - PAGE_MARGIN * 2;
    const contentBottom = doc.page.height - PAGE_MARGIN - FOOTER_RESERVED_HEIGHT;

    /** Starts a new page when the next block of this height would run into the footer. */
    const ensureSpace = (y: number, needed: number): number => {
      if (y + needed <= contentBottom) return y;
      doc.addPage();
      return PAGE_MARGIN;
    };

    let y = drawLetterhead(doc, { title: 'QUOTATION', template, margin: PAGE_MARGIN });

    // Title box
    const titleWidth = width * 0.84;
    const titleX = left + (width - titleWidth) / 2;
    doc.save().lineWidth(0.75).rect(titleX, y, titleWidth, 30).fillAndStroke(HEADER_TINT, BORDER).restore();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      .text(quotation.title.toUpperCase(), titleX + 8, y + 10, { width: titleWidth - 16, align: 'center', lineBreak: false, ellipsis: true });
    y += 48;

    // Client block
    const clientLines = [quotation.client.companyName, quotation.client.address]
      .filter((line): line is string => !!line?.trim())
      .flatMap((line) => line.split(/\r?\n|,\s*(?=\S)/).map((part, i, parts) => (i < parts.length - 1 ? `${part.trim()},` : part.trim())))
      .filter(Boolean);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
    clientLines.forEach((line) => {
      doc.text(line, left, y, { width: width * 0.6 });
      y = doc.y + 1;
    });
    if (quotation.client.contactPerson) {
      doc.font('Helvetica').fontSize(9.5).text(`Attn: ${quotation.client.contactPerson}`, left, y + 2, { width: width * 0.6 });
      y = doc.y;
    }
    y += 18;

    // Column layout shared by the reference row and the line table
    const cols = { sn: 45, description: 215, rate: 70, conversion: 80, amount: 105 };
    const refCells = (bold: boolean, texts: [string, string, string]): Cell[] => [
      { text: texts[0], width: cols.sn + cols.description, align: 'center', bold, fill: bold ? HEADER_TINT : undefined },
      { text: texts[1], width: cols.rate + cols.conversion, align: 'center', bold, fill: bold ? HEADER_TINT : undefined },
      { text: texts[2], width: cols.amount, align: 'center', bold, fill: bold ? HEADER_TINT : undefined },
    ];
    y = drawRow(doc, left, y, refCells(true, ['Quotation Number', 'Date', 'Job Number']), 18);
    y = drawRow(doc, left, y, refCells(false, [quotation.quotationNumber, formatDate(quotation.quotationDate), quotation.jobNumber || quotation.requestNumber]), 18);

    const tableHeader = (): Cell[] => [
      { text: 'SN', width: cols.sn, align: 'center', bold: true },
      { text: 'DESCRIPTION', width: cols.description, align: 'center', bold: true },
      { text: 'RATE', width: cols.rate, align: 'center', bold: true },
      { text: 'CONVERSION RATE', width: cols.conversion, align: 'center', bold: true },
      { text: 'AMOUNT (LKR)', width: cols.amount, align: 'center', bold: true },
    ];
    y = drawRow(doc, left, y, tableHeader(), 30);

    quotation.lineItems.forEach((item, index) => {
      const sn = String(index + 1).padStart(2, '0');
      const qty = item.quantity !== 1 ? ` × ${rateText(item.quantity)}` : '';
      const cells: Cell[] =
        item.currency === 'USD'
          ? [
              { text: sn, width: cols.sn, align: 'center' },
              { text: item.description, width: cols.description },
              { text: `USD ${rateText(item.rate)}${qty}`, width: cols.rate, align: 'center' },
              { text: rateText(quotation.exchangeRate), width: cols.conversion, align: 'center' },
              { text: money(item.amountLkr), width: cols.amount, align: 'right' },
            ]
          : [
              { text: sn, width: cols.sn, align: 'center' },
              {
                text: qty ? `${item.description} (LKR ${money(item.rate)}${qty})` : item.description,
                width: cols.description + cols.rate + cols.conversion,
              },
              { text: money(item.amountLkr), width: cols.amount, align: 'right' },
            ];

      const nextY = ensureSpace(y, 34);
      if (nextY !== y) y = drawRow(doc, left, nextY, tableHeader(), 30);
      y = drawRow(doc, left, y, cells, 34);
    });

    y = ensureSpace(y, 30);
    y = drawRow(doc, left, y, [
      { text: 'Total Amount', width: width - cols.amount, align: 'center', bold: true },
      { text: money(quotation.totalLkr), width: cols.amount, align: 'right', bold: true },
    ], 30);
    y += 24;

    // Notes and payment terms
    const listX = left + 24;
    const listWidth = width - 48;
    if (quotation.notes.length > 0) {
      y = ensureSpace(y, 40);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Note:', left, y);
      y = doc.y + 8;
      quotation.notes.forEach((note, index) => {
        doc.font('Helvetica').fontSize(9.5);
        const h = doc.heightOfString(note, { width: listWidth - 18, lineGap: 3 });
        y = ensureSpace(y, h + 6);
        doc.text(`${index + 1}.`, listX, y, { width: 18 });
        doc.text(note, listX + 18, y, { width: listWidth - 18, lineGap: 3 });
        y = doc.y + 6;
      });
      y += 8;
    }

    if (quotation.paymentTerms.length > 0) {
      y = ensureSpace(y, 40);
      doc.font('Helvetica-Bold').fontSize(10).text('Payment Terms:', left, y);
      y = doc.y + 8;
      quotation.paymentTerms.forEach((term) => {
        doc.font('Helvetica').fontSize(9.5);
        const h = doc.heightOfString(term, { width: listWidth - 18, lineGap: 3 });
        y = ensureSpace(y, h + 6);
        doc.text('•', listX + 4, y, { width: 14 });
        doc.text(term, listX + 18, y, { width: listWidth - 18, lineGap: 3 });
        y = doc.y + 6;
      });
      y += 8;
    }

    // Sign-off on the left, account details on the right
    const bankRowHeight = 18;
    const bankHeight = bankRowHeight * (QUOTATION_BANK_DETAILS.length + 1);
    y = ensureSpace(y + 16, Math.max(bankHeight, 110));

    const bankWidth = 290;
    const bankX = left + width - bankWidth;
    const signWidth = width - bankWidth - 20;

    // Sits above the account details box, so it can use the full width.
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#555555').text(`For ${COMPANY_NAME}`, left, y, { width, lineBreak: false });
    let signY = y + 58;
    doc.moveTo(left, signY).lineTo(left + 150, signY).lineWidth(0.5).dash(2, { space: 2 }).strokeColor('#999999').stroke().undash();
    signY += 6;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(quotation.preparedByName || ' ', left, signY, { width: signWidth });
    doc.font('Helvetica').fontSize(9.5);
    if (quotation.preparedByDesignation) doc.text(quotation.preparedByDesignation, left, doc.y + 2, { width: signWidth });
    doc.text('UQMS (PVT) LTD', left, doc.y + 2, { width: signWidth });

    const labelWidth = 100;
    let bankY = y + 30;
    doc.save().lineWidth(0.5).rect(bankX, bankY, bankWidth, bankRowHeight).fillAndStroke(GOLD, GOLD).restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text('ACCOUNT DETAILS', bankX + 6, bankY + 5, { width: bankWidth - 12, lineBreak: false });
    bankY += bankRowHeight;
    QUOTATION_BANK_DETAILS.forEach(([label, value], index) => {
      const isLast = index === QUOTATION_BANK_DETAILS.length - 1;
      doc.save().lineWidth(0.5).strokeColor('#bbbbbb');
      if (isLast) doc.rect(bankX, bankY, bankWidth, bankRowHeight).fillAndStroke(GOLD_TINT, '#bbbbbb');
      doc.rect(bankX, bankY, labelWidth, bankRowHeight).stroke();
      doc.rect(bankX + labelWidth, bankY, bankWidth - labelWidth, bankRowHeight).stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000')
        .text(label, bankX + 6, bankY + 6, { width: labelWidth - 12, lineBreak: false });
      // Shrink long values (the bank name) to fit on one line.
      const valueWidth = bankWidth - labelWidth - 12;
      doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica');
      let size = 7.5;
      while (size > 5.5 && doc.fontSize(size).widthOfString(value) > valueWidth) size -= 0.25;
      doc.text(value, bankX + labelWidth + 6, bankY + 6, { width: valueWidth, lineBreak: false });
      bankY += bankRowHeight;
    });

    drawControlledFooter(doc, { template, margin: PAGE_MARGIN });
    doc.end();
  });
};
