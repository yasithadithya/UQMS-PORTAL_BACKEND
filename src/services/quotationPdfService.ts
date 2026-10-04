import PDFDocument from 'pdfkit';
import { formatDate } from '../utils/date';
import { FOOTER_RESERVED_HEIGHT, drawCompanyLetterhead, drawPageNumberFooter } from './pdfLayout';
import type { IQuotationApproval, IQuotationClient, IQuotationDiscount, IQuotationLineItem } from '../models/Quotation';

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
  extraColumns?: string[];
  subtotalLkr?: number;
  discount?: IQuotationDiscount;
  discountLkr?: number;
  approval?: IQuotationApproval;
};

/** Printed on approved quotations in place of a handwritten signature. */
export const SYSTEM_GENERATED_NOTICE =
  'This is a system-generated quotation approved electronically through the UQMS Portal. No signature is required.';

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

/** Draws a small right-pointing arrowhead bullet (➢) with its left edge at x, centred on a text line at y. */
const drawArrowBullet = (doc: PDFKit.PDFDocument, x: number, y: number) => {
  const mid = y + 5;
  doc.save().polygon([x, mid - 4], [x + 8, mid], [x, mid + 4], [x + 2.5, mid]).fill('#000000').restore();
};

export const createQuotationPdfBuffer = async (quotation: QuotationLike): Promise<Buffer> => {
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

    let y = drawCompanyLetterhead(doc, { margin: PAGE_MARGIN });

    // Title box
    const titleWidth = width * 0.84;
    const titleX = left + (width - titleWidth) / 2;
    doc.save().lineWidth(0.75).rect(titleX, y, titleWidth, 34).fillAndStroke(HEADER_TINT, BORDER).restore();
    doc.font('Helvetica').fontSize(11).fillColor('#000000')
      .text(quotation.title.toUpperCase(), titleX + 8, y + 12, { width: titleWidth - 16, align: 'center', lineBreak: false, ellipsis: true });
    y += 62;

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

    // Column layout shared by the reference row and the line table. User-added columns sit
    // between Description and Rate and take their width from the description.
    const extraColumns = quotation.extraColumns ?? [];
    const extraTotal = extraColumns.length ? Math.min(extraColumns.length * 55, 120) : 0;
    const extraWidth = extraColumns.length ? extraTotal / extraColumns.length : 0;
    const cols = { sn: 45, description: 215 - extraTotal, rate: 70, conversion: 80, amount: 105 };
    const extraCells = (values: string[], bold = false): Cell[] =>
      extraColumns.map((_, i) => ({ text: values[i] ?? '', width: extraWidth, align: 'center' as const, bold }));
    const refCells = (bold: boolean, texts: [string, string, string]): Cell[] => [
      { text: texts[0], width: cols.sn + cols.description + extraTotal, align: 'center', bold, fill: bold ? HEADER_TINT : undefined },
      { text: texts[1], width: cols.rate + cols.conversion, align: 'center', bold, fill: bold ? HEADER_TINT : undefined },
      { text: texts[2], width: cols.amount, align: 'center', bold, fill: bold ? HEADER_TINT : undefined },
    ];
    y = drawRow(doc, left, y, refCells(true, ['Quotation Number', 'Date', 'Job Number']), 18);
    y = drawRow(doc, left, y, refCells(false, [quotation.quotationNumber, formatDate(quotation.quotationDate), quotation.jobNumber || quotation.requestNumber]), 18);

    const tableHeader = (): Cell[] => [
      { text: 'SN', width: cols.sn, align: 'center', bold: true },
      { text: 'DESCRIPTION', width: cols.description, align: 'center', bold: true },
      ...extraCells(extraColumns.map((label) => label.toUpperCase()), true),
      { text: 'USD RATE', width: cols.rate, align: 'center', bold: true },
      { text: 'CONVERSION RATE', width: cols.conversion, align: 'center', bold: true },
      { text: 'AMOUNT (LKR)', width: cols.amount, align: 'center', bold: true },
    ];
    y = drawRow(doc, left, y, tableHeader(), 30);

    quotation.lineItems.forEach((item, index) => {
      const sn = String(index + 1).padStart(2, '0');
      const qty = item.quantity !== 1 ? ` × ${rateText(item.quantity)}` : '';
      const extras = item.extra ?? [];
      const cells: Cell[] =
        item.currency === 'USD'
          ? [
              { text: sn, width: cols.sn, align: 'center' },
              { text: item.description, width: cols.description },
              ...extraCells(extras),
              { text: `${rateText(item.rate)}${qty}`, width: cols.rate, align: 'center' },
              { text: rateText(quotation.exchangeRate), width: cols.conversion, align: 'center' },
              { text: money(item.amountLkr), width: cols.amount, align: 'right' },
            ]
          : extraColumns.length
            ? [
                { text: sn, width: cols.sn, align: 'center' },
                { text: item.description, width: cols.description },
                ...extraCells(extras),
                { text: qty ? `LKR ${money(item.rate)}${qty}` : '', width: cols.rate + cols.conversion, align: 'center' },
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

    const discountLkr = quotation.discountLkr ?? 0;
    if (discountLkr > 0 && quotation.discount) {
      const subtotal = quotation.subtotalLkr ?? quotation.totalLkr + discountLkr;
      const label = quotation.discount.type === 'percent' ? `Discount (${rateText(quotation.discount.value)}%)` : 'Discount';
      y = ensureSpace(y, 60);
      y = drawRow(doc, left, y, [
        { text: 'Subtotal', width: width - cols.amount, align: 'center' },
        { text: money(subtotal), width: cols.amount, align: 'right' },
      ], 22);
      y = drawRow(doc, left, y, [
        { text: quotation.discount.description ? `${label} - ${quotation.discount.description}` : label, width: width - cols.amount, align: 'center' },
        { text: `(${money(discountLkr)})`, width: cols.amount, align: 'right' },
      ], 22);
    }

    y = ensureSpace(y, 30);
    y = drawRow(doc, left, y, [
      { text: 'Total Amount', width: width - cols.amount, align: 'center', bold: true },
      { text: money(quotation.totalLkr), width: cols.amount, align: 'right', bold: true },
    ], 30);
    y += 24;

    // Notes, then payment terms numbered on from the notes ("5. Payment Terms:") with arrow bullets.
    const noteX = left + 48;
    const listX = left + 72;
    const numberWidth = 20;
    const textX = listX + numberWidth;
    const textWidth = left + width - 24 - textX;
    const lineGap = 5;
    if (quotation.notes.length > 0) {
      y = ensureSpace(y, 40);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Note:', noteX, y);
      y = doc.y + 12;
      quotation.notes.forEach((note, index) => {
        doc.font('Helvetica').fontSize(10);
        const h = doc.heightOfString(note, { width: textWidth, lineGap });
        y = ensureSpace(y, h + 6);
        doc.text(`${index + 1}.`, listX, y, { width: numberWidth });
        doc.text(note, textX, y, { width: textWidth, lineGap });
        y = doc.y + 6;
      });
      y += 4;
    }

    if (quotation.paymentTerms.length > 0) {
      y = ensureSpace(y, 50);
      const numbered = quotation.notes.length > 0;
      doc.font('Helvetica').fontSize(10).fillColor('#000000');
      if (numbered) doc.text(`${quotation.notes.length + 1}.`, listX, y, { width: numberWidth });
      doc.text('Payment Terms:', numbered ? textX : noteX, y);
      y = doc.y + 14;
      const bulletX = textX + 34;
      const termX = bulletX + 20;
      const termWidth = left + width - 24 - termX;
      quotation.paymentTerms.forEach((term) => {
        doc.font('Helvetica').fontSize(10);
        const h = doc.heightOfString(term, { width: termWidth, lineGap });
        y = ensureSpace(y, h + 8);
        drawArrowBullet(doc, bulletX, y);
        doc.text(term, termX, y, { width: termWidth, lineGap });
        y = doc.y + 8;
      });
      y += 8;
    }

    // Sign-off on the left, account details on the right. An approved quotation carries a
    // system-generated notice below instead of a signature.
    const approval = quotation.approval?.approvedAt ? quotation.approval : undefined;
    const bankRowHeight = 18;
    const bankHeight = bankRowHeight * (QUOTATION_BANK_DETAILS.length + 1);
    y = ensureSpace(y + 16, bankHeight + 30 + (approval ? 40 : 0));

    const bankWidth = 290;
    const bankX = left + width - bankWidth;
    const signWidth = width - bankWidth - 20;

    // Sits above the account details box, so it can use the full width.
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#555555').text(`Prepared By`, left, y, { width, lineBreak: false });
    // An approved quotation needs no signature, so the name sits right under the company line.
    const signY = approval ? y + 22 : y + 64;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(quotation.preparedByName || ' ', left, signY, { width: signWidth });
    doc.font('Helvetica').fontSize(9.5);
    if (quotation.preparedByDesignation) doc.text(quotation.preparedByDesignation, left, doc.y + 2, { width: signWidth });
    // doc.text('UQMS (PVT) LTD', left, doc.y + 2, { width: signWidth });

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

    if (approval) {
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555')
        .text(SYSTEM_GENERATED_NOTICE, left, Math.max(bankY, doc.y) + 18, { width, align: 'center' });
      doc.fillColor('#000000');
    }

    drawPageNumberFooter(doc, { margin: PAGE_MARGIN });
    doc.end();
  });
};
