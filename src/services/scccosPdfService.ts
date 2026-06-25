import PDFDocument from 'pdfkit';
import path from 'path';

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

const formatDate = (value?: Date | string): string => {
  if (!value) return '-';
  const dateObj = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(dateObj.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);
};

export const createScccosPdfBuffer = async (
  scccos: any,
  qrBuffer: Buffer
): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
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

    // Resolve logo path
    let logoPath = path.join(__dirname, '../public/logo.png');
    if (!require('fs').existsSync(logoPath)) {
      logoPath = path.join(__dirname, '../../src/public/logo.png');
    }

    const drawHeader = (pageIndex: number) => {
      // 1. Logo
      try {
        if (require('fs').existsSync(logoPath)) {
          doc.image(logoPath, PAGE_MARGIN, PAGE_MARGIN - 5, { width: 50 });
        }
      } catch (err) {
        console.warn('Could not load logo image:', err);
      }

      // 2. Company Name
      doc.y = PAGE_MARGIN + 5;
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#1f4e79')
        .text('UNIVERSAL QUALITY MANAGEMENT SYSTEMS (PVT) LTD', PAGE_MARGIN + 60, PAGE_MARGIN + 5, {
          width: doc.page.width - PAGE_MARGIN * 2 - 130,
          align: 'center',
        });

      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#4b5563')
        .text('No; 08, Chandralekha Mawatha, Colombo 08, Sri Lanka.', {
          width: doc.page.width - PAGE_MARGIN * 2 - 130,
          align: 'center',
        });

      // 3. QR Code
      try {
        doc.image(qrBuffer, doc.page.width - PAGE_MARGIN - 60, PAGE_MARGIN - 5, {
          width: 60,
          height: 60,
        });
      } catch (err) {
        console.warn('Could not draw QR code image:', err);
      }

      // 4. Horizontal Rule
      const ruleY = PAGE_MARGIN + 60;
      doc
        .moveTo(innerLeft, ruleY)
        .lineTo(innerLeft + pageWidth, ruleY)
        .strokeColor('#5c93c4')
        .lineWidth(1)
        .stroke()
        .strokeColor('#000000')
        .lineWidth(1);

      return ruleY + 15;
    };

    // ────────────────────────────────────────────────────────
    // DRAW PAGE 1
    // ────────────────────────────────────────────────────────
    let currentY = drawHeader(0);

    // Title
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111827')
      .text('SMALL CRAFT CODE CERTIFICATE OF SURVEY', innerLeft, currentY, { align: 'center' });

    currentY += 25;

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
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f4e79').text('VESSEL PARTICULARS', innerLeft, currentY);
    currentY += 18;

    const vesselFields = [
      { label: 'Name of Vessel', value: toText(vessel.vesselName) },
      { label: 'Type of Vessel', value: toText(vessel.vesselType) },
      { label: 'Official Number', value: toText(booking.officialNo || vessel.imoNumber) },
      { label: 'MMSI Number', value: toText(vessel.mmsiNumber) },
      { label: 'Call Sign', value: toText(vessel.callSign) },
      { label: 'Port of Registry', value: toText(vessel.portOfRegistry) },
      { label: 'Date of Build', value: vessel.dateOfBuild ? new Date(vessel.dateOfBuild).getFullYear().toString() : toText(booking.buildDate ? new Date(booking.buildDate).getFullYear() : '-') }
    ];

    vesselFields.forEach((field) => {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(field.label, innerLeft, currentY);
      doc.font('Helvetica').text(`: ${field.value.toUpperCase()}`, innerLeft + labelW, currentY);
      currentY += 17;
    });

    currentY += 15;

    // SECTION: OWNER/ MANAGER/ OPERATOR DETAILS
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f4e79').text('OWNER/ MANAGER/ OPERATOR DETAILS', innerLeft, currentY);
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
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f4e79').text('SURVEY INFORMATION', innerLeft, currentY);
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

    const areaOfOperationText = toText(vessel.areaOfOperation);
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
      currentY += Math.max(17, valHeight + 2);
    });

    // ────────────────────────────────────────────────────────
    // DRAW PAGE 2
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = PAGE_MARGIN + 10;

    // SECTION: SURVEY FINDINGS
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f4e79').text('SURVEY FINDINGS', innerLeft, currentY);
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
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f4e79').text('CERTIFICATION', innerLeft, currentY);
    currentY += 15;

    const certText = 'I hereby certify that the inspection was carried out in accordance with the guidelines provided under the Small Craft Code 2025, and the vessel was found to comply with the relevant safety and equipment standards at the time of examination.';
    doc.font('Helvetica').fontSize(9.5).fillColor('#111827').lineGap(3).text(certText, innerLeft, currentY, {
      width: pageWidth,
      align: 'justify'
    });

    currentY += 45;

    // SIGNED details
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text('SIGNED:', innerLeft, currentY);

    // Date of issue on the right side
    const issueDateStr = `Date of issue: ${formatDate(scccos.dateOfIssue)}`;
    doc.font('Helvetica-Bold').text(issueDateStr, doc.page.width - PAGE_MARGIN - 180, currentY, { align: 'right', width: 180 });

    currentY += 50;

    // Signature Line
    doc.font('Helvetica').fillColor('#4b5563').text('....................................................................', innerLeft, currentY);
    currentY += 15;

    const surveyorName = scccos.issuedBy && typeof scccos.issuedBy === 'object'
      ? (scccos.issuedBy.username || 'Marine Surveyor')
      : 'S.A.P.M. SAMARASINGHE';

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(surveyorName.toUpperCase(), innerLeft, currentY);
    currentY += 14;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#4b5563').text('Marine Surveyor', innerLeft, currentY);
    currentY += 14;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#4b5563').text('Universal Quality Management Systems (Pvt) Ltd.', innerLeft, currentY);

    // Apply Footers to all pages
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Page 1 Footer Contact details
      if (i === 0) {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#111827')
          .text('PHONE: +94 76 68 68 718     WEB: www.uqms.net     E-Mail: info@uqms.net', PAGE_MARGIN, doc.page.height - PAGE_MARGIN - 15);
      }

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#9ca3af')
        .text(
          `Page ${i + 1} of ${totalPages}`,
          PAGE_MARGIN,
          doc.page.height - PAGE_MARGIN - 15,
          { width: pageWidth, align: 'right', lineBreak: false }
        );
    }

    doc.end();
  });
};
