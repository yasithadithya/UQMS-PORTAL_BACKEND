import PDFDocument from 'pdfkit';
import { formatDate } from '../utils/date';
import { DOCUMENT_TEMPLATE_NAMES, getDocumentTemplate } from './documentTemplateService';
import {
  FOOTER_RESERVED_HEIGHT,
  HEADING_COLOR,
  drawAdditionalRemarks,
  drawControlledFooter,
  drawLetterhead,
  measureAdditionalRemarks,
} from './pdfLayout';
import { ISignatureField } from '../models/ESignature';
import { GeneratedPdf, SIGNATURE_BLOCK_HEIGHT, drawSignatureBlock } from './eSignatureStamp';

const PAGE_MARGIN = 40;

const toText = (value: unknown, fallback = '-'): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      toText(record.name, '') ||
      toText(record.title, '') ||
      toText(record.code, '') ||
      toText(record.description, '') ||
      toText(record.vesselName, '') ||
      toText(record.username, fallback)
    );
  }
  return fallback;
};

export const createDockingSurveyPdfBuffer = async (
  cert: any,
  qrBuffer: Buffer
): Promise<GeneratedPdf> => {
  const template = await getDocumentTemplate(DOCUMENT_TEMPLATE_NAMES.dockingStatement);

  return new Promise<GeneratedPdf>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
      bufferPages: true,
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    let signatureField: ISignatureField | null = null;
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), signatureField }));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    const innerLeft = PAGE_MARGIN;

    // ────────────────────────────────────────────────────────
    // DRAW PAGE 1
    // ────────────────────────────────────────────────────────
    let currentY = drawLetterhead(doc, { title: 'DOCKING STATEMENT', template, margin: PAGE_MARGIN });

    // Verification QR code beside the certificate details
    const qrSize = 60;
    try {
      doc.image(qrBuffer, doc.page.width - PAGE_MARGIN - qrSize, currentY - 4, { width: qrSize, height: qrSize });
    } catch (err) {
      console.warn('Could not draw QR code image:', err);
    }

    const vesselName = cert.vesselId?.vesselName || 'NICOLAS';
    // The client is the vessel's manager, as shown under Manager Details in the survey report.
    const clientName = cert.client || cert.vesselId?.managerName || cert.surveyBookingId?.managedBy || '-';

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    const labelW = 120;

    const metadataFields = [
      { label: 'Project Name', value: vesselName },
      { label: 'Certificate No.', value: cert.certificateNumber },
      { label: 'Client', value: clientName },
      { label: 'Survey Location', value: cert.surveyLocation || 'DIKKOWITA FISHERIES HARBOUR' },
      { label: 'Docking Period', value: `${formatDate(cert.dockingPeriodStart)} – ${formatDate(cert.dockingPeriodEnd)}` },
    ];

    // Values stop short of the QR code and wrap onto extra lines when long.
    const valueW = pageWidth - labelW - qrSize - 10;
    metadataFields.forEach((field) => {
      doc.font('Helvetica').text(field.label, innerLeft, currentY);
      doc.font('Helvetica').text(`: ${field.value}`, innerLeft + labelW, currentY, { width: valueW });
      currentY += Math.max(18, doc.heightOfString(`: ${field.value}`, { width: valueW }) + 4);
    });

    currentY += 15;

    // Paragraph 1
    const p1Text = `This is to confirm that the undersigned surveyor was in attendance at the request of ${clientName}, in their capacity as Managers, and Operators of the vessel ${vesselName}. The surveyor attended along with a representative of the company during the above-mentioned dates, while the vessel was docked at ${cert.surveyLocation}.`;
    
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(p1Text, innerLeft, currentY, { align: 'justify', lineGap: 3 });
    currentY += doc.heightOfString(p1Text, { width: pageWidth, lineGap: 3 }) + 10;

    // Paragraph 2
    const p2Text = `The purpose of the attendance was to inspect and report on the condition of the vessel's underwater hull, hull coating, propeller, rudder, and associated hull appendages.`;
    doc.text(p2Text, innerLeft, currentY, { align: 'justify', lineGap: 3 });
    currentY += doc.heightOfString(p2Text, { width: pageWidth, lineGap: 3 }) + 25;

    // SURVEY FINDINGS SUMMARY
    doc.font('Helvetica-Bold').fontSize(12).fillColor(HEADING_COLOR).text('SURVEY FINDINGS SUMMARY', innerLeft, currentY);
    currentY += 15;

    const p3Text = `The underwater portion of the hull, including all openings, fastenings, and associated hull appendages, was examined while the vessel was resting on blocks at ${cert.surveyLocation}.\nThe following observations were made:`;
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(p3Text, innerLeft, currentY, { align: 'left', lineGap: 3 });
    currentY += doc.heightOfString(p3Text, { width: pageWidth, lineGap: 3 }) + 15;

    // Observations list
    const observations = [
      `The vessel is constructed with ${cert.constructionMaterial}.`,
      `It is fitted with ${cert.propellerDetails}.`,
      `The tail shaft and propeller are supported by ${cert.tailShaftBearings} and ${cert.bracketBearing}.`
    ];

    observations.forEach((obs, idx) => {
      doc.text(`${idx + 1}. `, innerLeft, currentY, { continued: true }).text(obs);
      currentY += 18;
    });

    currentY += 10;
    doc.text('Now done,', innerLeft, currentY);
    currentY += 15;

    const item1 = `1. Ultrasonic Thickness measurements were carried out by "${cert.thicknessMeasurementsBy}". Thickness measurements were witnessed and TM report No. ${cert.tmReportNo} dated ${formatDate(cert.tmReportDate)} was reviewed by the attending surveyor.`;
    doc.text(item1, innerLeft, currentY, { align: 'justify', lineGap: 3 });
    currentY += doc.heightOfString(item1, { width: pageWidth, lineGap: 3 }) + 10;

    const item2 = `2. Under water area of the hull has been High Pressure washed and Power tooled/ Manually cleaned by scraping. Underwater area has been recoated with High resistance paint and TBT free antifouling paint manufactured by ${cert.antifoulingPaintBy} Coatings. Coating condition found ${cert.coatingCondition}.`;
    doc.text(item2, innerLeft, currentY, { align: 'justify', lineGap: 3 });
    
    // ────────────────────────────────────────────────────────
    // DRAW PAGE 2
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = PAGE_MARGIN + 10;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_COLOR).text('Paint Details of Under Water:', innerLeft, currentY, { underline: true });
    currentY += 20;

    // Paint details table
    const tableTop = currentY;
    const colWidths = [60, 150, 120, 80, 105];
    const headers = ['Coat Number', 'Product Name', 'Product Number', 'DFT (µm)', 'Coat Type'];

    // Draw header
    let currentX = innerLeft;
    doc.font('Helvetica-Bold').fontSize(9);
    
    // Header background
    doc.rect(innerLeft, currentY, pageWidth, 25).fill('#e5e7eb');
    doc.fillColor('#111827');
    
    headers.forEach((h, i) => {
      doc.text(h, currentX + 5, currentY + 7, { width: colWidths[i] - 10, align: 'center' });
      currentX += colWidths[i];
    });
    
    currentY += 25;
    
    // Table rows
    doc.font('Helvetica');
    const paintDetails = cert.paintDetails && cert.paintDetails.length > 0 ? cert.paintDetails : [];
    
    paintDetails.forEach((row: any) => {
      currentX = innerLeft;
      const rowHeight = 20;
      doc.text(row.coatNumber || '-', currentX + 5, currentY + 5, { width: colWidths[0] - 10, align: 'center' });
      currentX += colWidths[0];
      doc.text(row.productName || '-', currentX + 5, currentY + 5, { width: colWidths[1] - 10, align: 'center' });
      currentX += colWidths[1];
      doc.text(row.productNumber || '-', currentX + 5, currentY + 5, { width: colWidths[2] - 10, align: 'center' });
      currentX += colWidths[2];
      doc.text(row.dft || '-', currentX + 5, currentY + 5, { width: colWidths[3] - 10, align: 'center' });
      currentX += colWidths[3];
      doc.text(row.coatType || '-', currentX + 5, currentY + 5, { width: colWidths[4] - 10, align: 'center' });
      currentY += rowHeight;
    });

    // Draw grid lines
    const tableBottom = currentY;
    doc.lineWidth(1).strokeColor('#d1d5db');
    
    // Horizontal lines
    for (let y = tableTop; y <= tableBottom; y += (y === tableTop ? 25 : 20)) {
      doc.moveTo(innerLeft, y).lineTo(innerLeft + pageWidth, y).stroke();
    }
    
    // Vertical lines
    let lineX = innerLeft;
    for (let i = 0; i <= colWidths.length; i++) {
      doc.moveTo(lineX, tableTop).lineTo(lineX, tableBottom).stroke();
      if (i < colWidths.length) lineX += colWidths[i];
    }
    
    currentY += 20;

    doc.font('Helvetica').fontSize(10);
    doc.text('3. Under Water Plate Renewals:', innerLeft, currentY);
    currentY += 15;
    if (cert.plateRenewals) {
      doc.text(cert.plateRenewals, innerLeft + 10, currentY, { lineGap: 3, width: pageWidth - 20 });
      currentY += doc.heightOfString(cert.plateRenewals, { lineGap: 3, width: pageWidth - 20 }) + 10;
    } else {
      doc.text('- None', innerLeft + 10, currentY);
      currentY += 20;
    }

    doc.text('4. Bearing Status', innerLeft, currentY);
    currentY += 15;
    
    const bearingStatusText = 'During the docking period, the stern tube, A-bracket bearing, and rudder bearings were measured, and the clearances were found to be within acceptable limits.';
    doc.text(bearingStatusText, innerLeft, currentY, { width: pageWidth });
    currentY += 30;

    // A helper to draw small clearance tables
    const drawClearanceTable = (title: string, headers: string[], row1: string, val11: string, val12: string, row2: string, val21: string, val22: string) => {
      doc.text(title, innerLeft, currentY);
      currentY += 15;

      // Size the label column to fit its text so labels never run under the value columns.
      const valW = 100;
      const cellPad = 5;
      const rows = [[row1, val11, val12], ...(row2 ? [[row2, val21, val22]] : [])];
      const widestLabel = Math.max(...rows.map(([label]) => doc.widthOfString(label)));
      const labelW = Math.min(Math.max(120, widestLabel + cellPad * 2), pageWidth - valW * 2);
      const col1X = innerLeft + labelW;
      const col2X = col1X + valW;
      const tableRight = col2X + valW;

      const cTableTop = currentY;
      // headers
      doc.rect(col1X, currentY, valW * 2, 20).fill('#e5e7eb');
      doc.fillColor('#111827');

      doc.text(headers[0], col1X, currentY + 5, { width: valW, align: 'center' });
      doc.text(headers[1], col2X, currentY + 5, { width: valW, align: 'center' });

      currentY += 20;
      const rowLines = [currentY];
      rows.forEach(([label, v1, v2]) => {
        const rowH = Math.max(20, doc.heightOfString(label, { width: labelW - cellPad * 2 }) + cellPad * 2);
        doc.text(label, innerLeft + cellPad, currentY + cellPad, { width: labelW - cellPad * 2 });
        doc.text(v1 || '-', col1X, currentY + cellPad, { width: valW, align: 'center' });
        doc.text(v2 || '-', col2X, currentY + cellPad, { width: valW, align: 'center' });
        currentY += rowH;
        rowLines.push(currentY);
      });

      const cTableBottom = currentY;

      // Lines
      doc.lineWidth(1).strokeColor('#d1d5db');
      // Horiz
      doc.moveTo(col1X, cTableTop).lineTo(tableRight, cTableTop).stroke();
      rowLines.forEach((y) => doc.moveTo(innerLeft, y).lineTo(tableRight, y).stroke());

      // Vert
      doc.moveTo(innerLeft, cTableTop + 20).lineTo(innerLeft, cTableBottom).stroke();
      [col1X, col2X, tableRight].forEach((x) => doc.moveTo(x, cTableTop).lineTo(x, cTableBottom).stroke());

      currentY += 20;
    };

    drawClearanceTable('a) Tail Shaft/ Stern Tube Bearing Bush', ['P-S', 'T-B'], 
      'Port - Stern Tube Shaft bearing bush Clearance', cert.sternTubeClearancePortPS, cert.sternTubeClearancePortTB,
      'Stbd - Stern Tube Shaft bearing bush Clearance', cert.sternTubeClearanceStbdPS, cert.sternTubeClearanceStbdTB
    );

    drawClearanceTable('b) \'A\' Bracket', ['P-S', 'T-B'], 
      'Port - \'A\' Bracket Clearance', cert.aBracketClearancePortPS, cert.aBracketClearancePortTB,
      'Stbd - \'A\' Bracket Clearance', cert.aBracketClearanceStbdPS, cert.aBracketClearanceStbdTB
    );
    
    // ────────────────────────────────────────────────────────
    // DRAW PAGE 3
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = PAGE_MARGIN + 10;
    
    drawClearanceTable('c) Rudder Bearing', ['P-S', 'F-A'], 
      'Port Bearing bush', cert.rudderBearingPortPS, cert.rudderBearingPortFA,
      'STBD Bearing bush', cert.rudderBearingStbdPS, cert.rudderBearingStbdFA
    );

    doc.text(`5. ${cert.overboardValves}`, innerLeft, currentY, { width: pageWidth });
    currentY += 20;
    
    doc.text(`6. ${cert.anodes}`, innerLeft, currentY, { width: pageWidth });
    currentY += 40;

    // Keep the additional remarks, the SIGNED line and the electronic signature field together above the footer.
    const remarksHeight = measureAdditionalRemarks(doc, cert.additionalRemarks, pageWidth);
    if (currentY + remarksHeight + 25 + SIGNATURE_BLOCK_HEIGHT > doc.page.height - PAGE_MARGIN - FOOTER_RESERVED_HEIGHT) {
      doc.addPage();
      currentY = PAGE_MARGIN + 10;
    }

    currentY = drawAdditionalRemarks(doc, cert.additionalRemarks, innerLeft, currentY, pageWidth);

    // SIGNED details
    doc.font('Helvetica-Bold').fontSize(10).fillColor(HEADING_COLOR).text('SIGNED:', innerLeft, currentY);

    // Date of issue on the right side
    const issueDateStr = `Date of issue: ${formatDate(cert.dateOfIssue)}`;
    doc.font('Helvetica-Bold').text(issueDateStr, doc.page.width - PAGE_MARGIN - 180, currentY, { align: 'right', width: 180 });

    currentY += 25;
    signatureField = drawSignatureBlock(doc, innerLeft, currentY, cert.eSignature);

    drawControlledFooter(doc, { template, margin: PAGE_MARGIN });

    doc.end();
  });
};
