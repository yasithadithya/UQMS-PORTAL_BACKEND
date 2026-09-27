import PDFDocument from 'pdfkit';
import { formatDate } from '../utils/date';
import { DOCUMENT_TEMPLATE_NAMES, getDocumentTemplate } from './documentTemplateService';
import {
  FOOTER_RESERVED_HEIGHT,
  HEADING_COLOR,
  drawAdditionalRemarks,
  drawLetterhead,
  measureAdditionalRemarks,
} from './pdfLayout';
import { ISignatureField } from '../models/ESignature';
import { GeneratedPdf, SIGNATURE_BLOCK_HEIGHT, drawSignatureBlock } from './eSignatureStamp';

const PAGE_MARGIN = 40;
const PAGE_BOTTOM_SAFE = 60;

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

export const createScccosPdfBuffer = async (
  scccos: any,
  qrBuffer: Buffer
): Promise<GeneratedPdf> => {
  const template = await getDocumentTemplate(DOCUMENT_TEMPLATE_NAMES.scccos);

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
    let currentY = drawLetterhead(doc, { title: 'SMALL CRAFT CODE CERTIFICATE OF SURVEY', template, margin: PAGE_MARGIN });

    // Verification QR code beside the certificate details
    try {
      doc.image(qrBuffer, doc.page.width - PAGE_MARGIN - 60, currentY - 4, { width: 60, height: 60 });
    } catch (err) {
      console.warn('Could not draw QR code image:', err);
    }

    // Metadata block
    const vessel = scccos.vesselId || {};
    const booking = scccos.surveyBookingId || {};
    const typeOfSurvey = scccos.typeOfSurvey || 'SSC Initial Survey';

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    const labelW = 160;

    // Row 1
    doc.font('Helvetica-Bold').text('Name of Certifying Body', innerLeft, currentY);
    doc.font('Helvetica').text(`: Universal Quality Management Systems (Pvt) Ltd.`, innerLeft + labelW, currentY);
    currentY += 18;

    // Row 2
    doc.font('Helvetica-Bold').text('Type of Survey', innerLeft, currentY);
    doc.font('Helvetica').text(`: ${typeOfSurvey}`, innerLeft + labelW, currentY);
    currentY += 18;

    // Row 3
    doc.font('Helvetica-Bold').text('Certificate No', innerLeft, currentY);
    doc.font('Helvetica').text(`: ${scccos.certificateNumber}`, innerLeft + labelW, currentY);
    currentY += 25;

    // SECTION: VESSEL PARTICULARS
    doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_COLOR).text('VESSEL PARTICULARS', innerLeft, currentY);
    currentY += 18;

    const vesselFields = [
      { label: 'Name of Vessel', value: toText(vessel.vesselName) },
      { label: 'Type of Vessel', value: toText(vessel.vesselType) },
      { label: 'Official Number', value: toText(booking.officialNo || vessel.imoNumber) },
      { label: 'MMSI Number', value: toText(vessel.mmsiNumber) },
      { label: 'Call Sign', value: toText(vessel.callSign) },
      { label: 'Port of Registry', value: toText(vessel.portOfRegistry) },
      { label: 'Date of Build', value: vessel.dateOfBuild ? (vessel.dateOfBuild.match(/\d{4}/)?.[0] || '-') : toText(booking.buildDate ? (booking.buildDate.match(/\d{4}/)?.[0] || '-') : '-') }
    ];

    vesselFields.forEach((field) => {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(field.label, innerLeft, currentY);
      doc.font('Helvetica').text(`: ${field.value.toUpperCase()}`, innerLeft + labelW, currentY);
      currentY += 17;
    });

    currentY += 15;

    // SECTION: OWNER/ MANAGER/ OPERATOR DETAILS
    doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_COLOR).text('OWNER/ MANAGER/ OPERATOR DETAILS', innerLeft, currentY);
    currentY += 15;

    // Three side-by-side boxes: Left=Owner, Mid=Manager, Right=Operator
    const boxW = 160;
    const boxG = 17;
    const boxH = 95;

    // Render Box Borders
    doc.rect(innerLeft, currentY, boxW, boxH).stroke();
    doc.rect(innerLeft + boxW + boxG, currentY, boxW, boxH).stroke();
    doc.rect(innerLeft + (boxW + boxG) * 2, currentY, boxW, boxH).stroke();

    // Box contents helper
    const drawBoxText = (x: number, title: string, text: string) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text(title, x + 6, currentY + 6, { underline: true });
      doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(text || '-', x + 6, currentY + 20, {
        width: boxW - 12,
        height: boxH - 25,
        ellipsis: true
      });
    };

    const ownerName = toText(vessel.registeredOwnerName);
    const ownerAddr = toText(vessel.registeredOwnerAddress);
    const ownerText = ownerName !== '-' ? `${ownerName},\n${ownerAddr}` : ownerAddr;

    const managerName = toText(vessel.managerName);
    const managerAddr = toText(vessel.managerAddress);
    const managerText = managerName !== '-' ? `${managerName},\n${managerAddr}` : managerAddr;

    // Fallback operator details to manager if not explicitly set
    const operatorName = toText(vessel.invoicingName || vessel.managerName);
    const operatorAddr = toText(vessel.invoicingAddress || vessel.managerAddress);
    const operatorText = operatorName !== '-' ? `${operatorName},\n${operatorAddr}` : operatorAddr;

    drawBoxText(innerLeft, 'Owner: Name & Address', ownerText);
    drawBoxText(innerLeft + boxW + boxG, 'Manager: Name & Address', managerText);
    drawBoxText(innerLeft + (boxW + boxG) * 2, 'Operator: Name & Address', operatorText);

    currentY += boxH + 20;

    // SECTION: SURVEY INFORMATION
    doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_COLOR).text('SURVEY INFORMATION', innerLeft, currentY);
    currentY += 15;

    // Calculate first visit date and last visit date
    let firstVisitDate = booking.requestedDate || scccos.createdAt;
    let lastVisitDate = booking.lastVisitDate || booking.lastVisit || scccos.createdAt;

    if (booking.visitDetails && booking.visitDetails.length > 0) {
      const sortedVisits = [...booking.visitDetails].sort(
        (a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime()
      );
      if (sortedVisits[0]?.visitDate) {
        firstVisitDate = sortedVisits[0].visitDate;
      }
      const lastVisitRow = booking.visitDetails.find((v: any) => v.isLastVisitDate || v.isLastVist);
      if (lastVisitRow?.visitDate) {
        lastVisitDate = lastVisitRow.visitDate;
      } else if (sortedVisits[sortedVisits.length - 1]?.visitDate) {
        lastVisitDate = sortedVisits[sortedVisits.length - 1].visitDate;
      }
    }

    const areaCategory = toText((vessel.areaOfOperation as any)?.AreaCategory ?? vessel.areaOfOperation);
    const areaOfOperationText = areaCategory !== '-' ? `Category ${areaCategory}` : '-';
    const nominatedPoint = scccos.nominatedDeparturePoint || 'Following respective Ports: Colombo, Galle, Hambantota, Trincomalee';

    const surveyFields = [
      { label: 'Place of Survey', value: toText(booking.portOfSurvey) },
      { label: 'First Visit Date', value: formatDate(firstVisitDate) },
      { label: 'Last Visit Date', value: formatDate(lastVisitDate) },
      { label: 'Operational Area Category Assigned', value: areaOfOperationText },
      { label: 'Nominated Departure Point (for Cat. 4/5)', value: nominatedPoint }
    ];

    surveyFields.forEach((field) => {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(field.label, innerLeft, currentY, { width: labelW });
      doc.font('Helvetica').text(`: ${field.value}`, innerLeft + labelW, currentY, { width: pageWidth - labelW });

      const valHeight = doc.heightOfString(field.value, { width: pageWidth - labelW });
      doc.font('Helvetica-Bold');
      const labelHeight = doc.heightOfString(field.label, { width: labelW });
      currentY += Math.max(17, valHeight + 2, labelHeight + 2);
    });

    // ────────────────────────────────────────────────────────
    // DRAW PAGE 2
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = PAGE_MARGIN + 10;

    // SECTION: SURVEY FINDINGS
    doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_COLOR).text('SURVEY FINDINGS', innerLeft, currentY);
    currentY += 18;

    const findings = scccos.surveyFindings || [];
    findings.forEach((finding: any) => {
      const categoryLabel = finding.category;
      const statusValue = finding.status ? finding.status.toUpperCase() : 'N/A';

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(categoryLabel, innerLeft, currentY);

      let color = '#4b5563'; // Grey for N/A
      if (statusValue === 'SATISFACTORY') {
        color = '#16a34a'; // Green
      } else if (statusValue === 'NOT SATISFACTORY') {
        color = '#dc2626'; // Red
      }

      doc.font('Helvetica-Bold').fillColor(color).text(`: ${statusValue}`, innerLeft + 180, currentY);
      currentY += 18;
    });

    currentY += 15;

    // SECTION: CERTIFICATION
    doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_COLOR).text('CERTIFICATION', innerLeft, currentY);
    currentY += 15;

    const certText = 'I hereby certify that the inspection was carried out in accordance with the guidelines provided under the Small Craft Code 2025, and the vessel was found to comply with the relevant safety and equipment standards at the time of examination.';
    doc.font('Helvetica').fontSize(9.5).fillColor('#111827').lineGap(3).text(certText, innerLeft, currentY, {
      width: pageWidth,
      align: 'justify'
    });

    currentY += 45;

    // Keep the additional remarks, the SIGNED line and the electronic signature field together above the footer.
    const remarksHeight = measureAdditionalRemarks(doc, scccos.additionalRemarks, pageWidth);
    if (currentY + remarksHeight + 25 + SIGNATURE_BLOCK_HEIGHT > doc.page.height - PAGE_MARGIN - FOOTER_RESERVED_HEIGHT) {
      doc.addPage();
      currentY = PAGE_MARGIN + 10;
    }

    currentY = drawAdditionalRemarks(doc, scccos.additionalRemarks, innerLeft, currentY, pageWidth);

    // SIGNED details
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(HEADING_COLOR).text('SIGNED:', innerLeft, currentY);

    // Date of issue on the right side
    const issueDateStr = `Date of issue: ${formatDate(scccos.dateOfIssue)}`;
    doc.font('Helvetica-Bold').text(issueDateStr, doc.page.width - PAGE_MARGIN - 180, currentY, { align: 'right', width: 180 });

    currentY += 25;
    signatureField = drawSignatureBlock(doc, innerLeft, currentY, scccos.eSignature);

    doc.end();
  });
};
