import PDFDocument from 'pdfkit';
import path from 'path';
type RequestLike = {
  requestNumber: string;
  rfsDocNo?: string;
  vesselCode?: string;
  vesselName: string;
  uqmsNumber?: string;
  imoNumber?: string;
  mmsiNumber?: string;
  companyName: string;
  contactPersonName: string;
  contactPersonNumber: string;
  registerdAddress?: string;
  invoicingAddress: string;
  companyEmail: string;
  sector: string;
  status: string;
  createdAt?: Date;
  vesselType?: unknown;
  areaOfOperation?: unknown;
  surveyTypes?: unknown[];
};

const PAGE_MARGIN = 40;
// Bottom threshold — if remaining space on page is less than this, add a new page
const PAGE_BOTTOM_SAFE = 60;

const toText = (value: unknown, fallback = '-'): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toText(item, '')).filter(Boolean).join(', ') || fallback;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      toText(record.name, '') ||
      toText(record.title, '') ||
      toText(record.code, '') ||
      toText(record.description, '') ||
      toText(record.AreaCategory, '') ||
      toText(record.group, '') ||
      toText(record._id, fallback)
    );
  }
  return fallback;
};

const formatDate = (value?: Date): string => {
  if (!value) return '-';
  // Use en-GB locale to guarantee dd/mm/yyyy formatting standard
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
};

/**
 * Draw a table row at absolute (x, y) using PDFKit's low-level rect+text API.
 * Returns the Y coordinate immediately BELOW the drawn row.
 * NOTE: This does NOT move doc.y — caller must sync doc.y after calling this.
 */
const drawTableRow = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  widths: number[],
  values: string[],
  minHeight: number,
): number => {
  doc.font('Helvetica').fontSize(9);

  let height = minHeight;
  widths.forEach((width, index) => {
    const text = values[index] ?? '-';
    const textHeight = doc.heightOfString(text, { width: width - 10 });
    const cellHeight = textHeight + 10;
    if (cellHeight > height) {
      height = cellHeight;
    }
  });

  let currentX = x;
  widths.forEach((width, index) => {
    doc.rect(currentX, y, width, height).stroke();
    doc
      .fillColor('#000000')
      .text(values[index] ?? '-', currentX + 5, y + 5, {
        width: width - 10,
        height: height - 10,
        lineBreak: true,
      });
    currentX += width;
  });
  return y + height;
};

export const createRequestSurveyPdfBuffer = async (request: RequestLike): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
      bufferPages: true,
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    const innerLeft = PAGE_MARGIN;
    const pageContentBottom = doc.page.height - PAGE_MARGIN - PAGE_BOTTOM_SAFE;

    // ─────────────────────────────────────────────
    // PAGE 1
    // ─────────────────────────────────────────────

    // Header
    let logoPath = path.join(__dirname, '../public/logo.png');
    // Fallback for compiled dist/services/requestPdfService.js
    if (!require('fs').existsSync(logoPath)) {
      logoPath = path.join(__dirname, '../../src/public/logo.png');
    }

    try {
      if (require('fs').existsSync(logoPath)) {
        doc.image(logoPath, PAGE_MARGIN, PAGE_MARGIN - 5, { width: 50 });
      } else {
        console.warn('Logo image not found at', logoPath);
      }
    } catch (err) {
      console.warn('Could not load logo image:', err);
    }

    doc.y = PAGE_MARGIN + 5;
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#1f4e79')
      .text('UNIVERSAL QUALITY MANAGEMENT SYSTEMS (PVT) LTD', { align: 'center' });

    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000000')
      .text('No: 08, Chandralekha Mawatha, Colombo 08, Sri Lanka.', { align: 'center' });

    if (doc.y < PAGE_MARGIN + 55) {
      doc.y = PAGE_MARGIN + 55;
    }
    doc.moveDown(0.4);
    const ruleY = doc.y;
    doc
      .moveTo(innerLeft, ruleY)
      .lineTo(innerLeft + pageWidth, ruleY)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke()
      .strokeColor('#000000')
      .lineWidth(1);
    doc.moveDown(0.7);

    // Title
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#000000')
      .text('REQUEST FOR SURVEY', { align: 'center' });
    doc.moveDown(0.7);

    // Date/Info boxes — drawn at absolute position, top-right corner
    const boxLabelW = 55;
    const boxValW = 135;
    const boxTotalW = boxLabelW + boxValW; // 190
    const startX = doc.page.width - PAGE_MARGIN - boxTotalW;
    const dateY = doc.y;
    let currentY = dateY;

    // 1. Doc Number Box
    doc.rect(startX, currentY, boxLabelW, 20).stroke();
    doc.rect(startX + boxLabelW, currentY, boxValW, 20).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000')
      .text('RFS No.', startX + 4, currentY + 5.5, { width: boxLabelW - 8, lineBreak: false });
    doc.font('Helvetica').fontSize(8.5)
      .text(request.rfsDocNo || '-', startX + boxLabelW + 4, currentY + 5.5, { width: boxValW - 8, lineBreak: false });

    currentY += 20;

    // 2. Date Box
    doc.rect(startX, currentY, boxLabelW, 20).stroke();
    doc.rect(startX + boxLabelW, currentY, boxValW, 20).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5)
      .text('Date', startX + 4, currentY + 5.5, { width: boxLabelW - 8, lineBreak: false });
    doc.font('Helvetica').fontSize(8.5)
      .text(formatDate(request.createdAt), startX + boxLabelW + 4, currentY + 5.5, { width: boxValW - 8, lineBreak: false });

    // "To," block — back at left margin, same Y as doc number box
    doc.font('Helvetica-Bold').fontSize(10).text('To,', innerLeft, dateY);
    doc.font('Helvetica').fontSize(9.5).text('Universal Quality Management System.', innerLeft, dateY + 18);

    // Set doc.y safely below the boxes before continuing
    doc.y = dateY + 45;
    doc.moveDown(0.6);

    // Intro paragraph
    const introText =
      "We request the management of Universal Quality Management Systems to instruct the Certifying Body's surveyor to carry " +
      'out surveys and issue certificates and/or reports for classification and statutory services. We agree to provide a safe working ' +
      'environment and to grant the surveyors the necessary facilities and access required to perform their duties. Where applicable, we ' +
      'also ensure that all subcontractors and suppliers of materials, components, and equipment provide the same. Irrespective of ' +
      'whether the surveys are completed, we agree to pay all survey fees and expenses incurred in connection with the below-' +
      "mentioned survey(s) and/or the issuance of the relevant certificate(s), in accordance with the payment terms stated on your invoices.";

    doc.font('Helvetica').fontSize(9).lineGap(1.5).text(introText, innerLeft, doc.y, {
      width: pageWidth,
      align: 'justify',
    });

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(10).text('Client Details');
    doc.moveDown(0.35);

    // Client Details Table — column widths
    const col1 = 110;
    const col2 = 180;
    const col3 = 90;
    const col4 = pageWidth - col1 - col2 - col3;
    //
    let y = doc.y;

    y = drawTableRow(doc, innerLeft, y, [col1, col2, col3, col4],
      ['Company Name', request.companyName, 'Telephone No.', request.contactPersonNumber], 24);
    y = drawTableRow(doc, innerLeft, y, [col1, col2, col3, col4],
      ['Vessel Name', request.vesselName, 'UQMS No.', request.uqmsNumber ?? '-'], 24);
    y = drawTableRow(doc, innerLeft, y, [col1, col2, col3, col4],
      ['IMO Number', request.imoNumber ?? '-', 'MMSI Number', request.mmsiNumber ?? '-'], 24);
    y = drawTableRow(doc, innerLeft, y, [col1, pageWidth - col1],
      ['Registered Address', request.registerdAddress ?? '-'], 36);
    y = drawTableRow(doc, innerLeft, y, [col1, pageWidth - col1],
      ['Invoicing Address', request.invoicingAddress], 30);
    y = drawTableRow(doc, innerLeft, y, [col1, col2, col3, col4],
      ['Vessel Code', request.vesselCode ?? '-', 'Sector', request.sector], 24);
    y = drawTableRow(doc, innerLeft, y, [col1, col2, col3, col4],
      ['Company email ID', request.companyEmail, 'Status', request.status], 24);
    y = drawTableRow(doc, innerLeft, y, [col1, pageWidth - col1],
      ['Vessel Type', toText(request.vesselType)], 22);
    y = drawTableRow(doc, innerLeft, y, [col1, pageWidth - col1],
      ['Area of Operation', toText(request.areaOfOperation)], 22);
    y = drawTableRow(doc, innerLeft, y, [col1, pageWidth - col1],
      ['Contact Person Name', request.contactPersonName], 22);

    // Sync doc.y to where our absolute drawing ended
    doc.text('', innerLeft, y);
    doc.moveDown(0.8);

    // ── Statutory Surveys Table ──
    doc.font('Helvetica-Bold').fontSize(10).text('STATUTORY SURVEY/S REQUESTED:');
    doc.moveDown(0.35);

    const noColW = 32;
    const surveyColW = pageWidth - noColW;

    // Header row
    let surveyY = doc.y;
    doc.rect(innerLeft, surveyY, noColW, 20).stroke();
    doc.rect(innerLeft + noColW, surveyY, surveyColW, 20).stroke();
    doc.font('Helvetica-Bold').fontSize(9).text('No.', innerLeft + 4, surveyY + 5, { width: noColW - 8, lineBreak: false });
    doc.text('Survey Type', innerLeft + noColW + 4, surveyY + 5, { width: surveyColW - 8, lineBreak: false });
    surveyY += 20;

    const surveyTypes = request.surveyTypes && request.surveyTypes.length > 0 ? request.surveyTypes : [];

    if (surveyTypes.length === 0) {
      for (let i = 1; i <= 6; i++) {
        surveyY = drawTableRow(doc, innerLeft, surveyY, [noColW, surveyColW], [String(i), ''], 18);
      }
    } else {
      surveyTypes.forEach((st, idx) => {
        // If this row would overflow the page, start a new page and re-draw the survey header
        if (surveyY + 18 > pageContentBottom + PAGE_BOTTOM_SAFE) {
          doc.addPage();
          surveyY = PAGE_MARGIN;
          // Redraw column headers on continuation page
          doc.rect(innerLeft, surveyY, noColW, 20).stroke();
          doc.rect(innerLeft + noColW, surveyY, surveyColW, 20).stroke();
          doc.font('Helvetica-Bold').fontSize(9).text('No.', innerLeft + 4, surveyY + 5, { width: noColW - 8, lineBreak: false });
          doc.text('Survey Type', innerLeft + noColW + 4, surveyY + 5, { width: surveyColW - 8, lineBreak: false });
          surveyY += 20;
        }
        surveyY = drawTableRow(doc, innerLeft, surveyY, [noColW, surveyColW], [String(idx + 1), toText(st)], 18);
      });
    }

    // Sync doc.y after survey table
    doc.text('', innerLeft, surveyY);
    doc.moveDown(0.5);

    // Terms acceptance sentence
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .text(
        'We agree to accept the Terms & Conditions indicated herein under and ensure the payment of all survey fees, tax and ' +
        'expenses incurred for the above-mentioned surveys(s) and issue of relevant certificate(s)',
        innerLeft, doc.y,
        { width: pageWidth, align: 'left' },
      );

    doc.moveDown(0.5);

    // ── Signature boxes ──
    // If not enough room on current page for signatures (120px), add a new page
    const sigH = 120;
    if (doc.y + sigH + 10 > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
    }

    const sigTop = doc.y;
    const leftSigW = Math.floor(pageWidth * 0.6);
    const rightSigW = pageWidth - leftSigW;

    doc.rect(innerLeft, sigTop, leftSigW, sigH).stroke();
    doc.rect(innerLeft + leftSigW, sigTop, rightSigW, sigH).stroke();

    doc.font('Helvetica').fontSize(9);
    doc.text('Name in BLOCK CAPITALS:', innerLeft + 5, sigTop + 8, { lineBreak: false });
    doc.text('Designation:', innerLeft + 5, sigTop + 36, { lineBreak: false });
    doc.text('Place and Date:', innerLeft + 5, sigTop + 64, { lineBreak: false });
    doc.text('Signature:', innerLeft + 5, sigTop + 92, { lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Signature & Official Stamps', innerLeft + leftSigW + 8, sigTop + sigH / 2 - 8, {
        width: rightSigW - 16,
        align: 'center',
        lineBreak: false,
      });

    // ─────────────────────────────────────────────
    // Terms & Conditions page
    // ─────────────────────────────────────────────
    doc.addPage();

    doc.font('Helvetica-Bold').fontSize(12).text('TERMS AND CONDITIONS', innerLeft, PAGE_MARGIN + 10, {
      width: pageWidth,
      align: 'center',
    });
    doc.moveDown(1.2);

    // Terms array — NO tab characters (they corrupt PDFKit built-in fonts).
    // Each term is an object with a number prefix and body text, rendered separately.
    const terms: { num: string; body: string }[] = [
      {
        num: '1)',
        body: 'All the applicable requirements of the applicable class and conventional Rules & Regulation will be complied with.',
      },
      {
        num: '2)',
        body: 'No repairs will be carried out without the concurrence of the attending surveyor.',
      },
      {
        num: '3)',
        body: 'Supplies of machinery, equipment and components, required to be manufactured/fabricated under UQMS inspection as per the Rules & Regulation, will be instructed to manufacturer/fabricate and supply the same (prior to installation) under inspection of UQMS surveyors.',
      },
      {
        num: '4)',
        body: "Whilst universal quality management system, a certify body, along with its subsidiaries and associates (hereinafter referred to as the society) and its board/committees use their best endeavours to ensure that the functions of the certify body are properly carried out, in providing services, information or advice neither the certify body nor any of its servants or agents warrants the accuracy of any information or advice supplied. Except as set out herein neither the certify body nor any of its servants or agents (on behalf of each of whom the certify body has agreed this clause) shall be liable for any loss damage or expense whatever sustained by any person due to any act or omission or error of whatsoever nature and however caused of the certify body, its servants or agents or due to any inaccuracy of whatsoever nature and howsoever caused in any information or advice given in any way whatsoever by or on behalf of the certify body, even if held to amount to a breach of warranty. Nevertheless, if any person uses services of the certify body, or relies on any information or advice given by or on behalf of the certify body and suffers loss damage or expenses thereby which is proved to have been due to any negligent act omission or error of the certify body, its servants or agents or any negligent inaccuracy in information or advice given by or on behalf of the certify body then the certify body will pay compensation to such person for his proved loss up to but not exceeding the amount of the fee charged by the certify body for that particular service, information or advice.",
      },
      {
        num: '5)',
        body: "Any notice of claim for loss, damage, or expense, as referred to above, shall be made in writing to the certifying body's Head Office within six months from the date on which the service, information, or advice was first provided. Failing this, all rights to any such claim shall be forfeited, and the certifying body shall be relieved and discharged from all liabilities.",
      },
      {
        num: '6)',
        body: "UQMS renders all its services with complete confidentiality in respect of its clients' technical and commercial data. Disclosure of such information shall be subject to the written consent of the owner of the information, in accordance with applicable legal and statutory requirements and obligations.",
      },
      {
        num: '7)',
        body: "The Contract shall remain in force until terminated by either UQMS or the Client upon giving the other party a written notice. In the event that the Contract is terminated by the Client before completion of the Services, UQMS's fees shall be calculated on a pro rata basis up to the effective date of termination. Any reasonable costs directly arising from such early termination, together with any outstanding amounts due to UQMS, shall become immediately payable.",
      },
    ];

    const numColW = 18;
    const bodyColW = pageWidth - numColW;

    doc.font('Helvetica').fontSize(9).lineGap(2);

    terms.forEach((term, idx) => {
      const termY = doc.y;

      // Number prefix — fixed width column, no line break
      doc.text(term.num, innerLeft, termY, { width: numColW, lineBreak: false });

      // Body text — indented, wrapping
      doc.text(term.body, innerLeft + numColW, termY, {
        width: bodyColW,
        align: 'justify',
      });

      if (idx < terms.length - 1) doc.moveDown(0.6);
    });

    // ─────────────────────────────────────────────
    // Page footers — MUST stay within page bounds.
    // Use height - PAGE_MARGIN - 12 so PDFKit never
    // triggers an automatic new page.
    // ─────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000000')
        .text(
          'Document No: UQMS-FM-009  |  Revision: 00  |  Effective Date: [25/01/2026]  |  Approved By: Technical Committee',
          PAGE_MARGIN,
          doc.page.height - PAGE_MARGIN - 12,
          { width: pageWidth, align: 'left', lineBreak: false },
        );

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000000')
        .text(
          `Page ${i + 1} of ${totalPages}`,
          PAGE_MARGIN,
          doc.page.height - PAGE_MARGIN - 12,  // safely inside the page
          { width: pageWidth, align: 'right', lineBreak: false },
        );
    }

    doc.end();
  });