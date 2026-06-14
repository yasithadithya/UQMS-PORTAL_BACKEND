import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

const PAGE_MARGIN = 40;

const formatDate = (value?: Date | string | null): string => {
  if (!value) return '-';
  const dateObj = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(dateObj.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dateObj);
};

// Helper to parse comma/pipe separated remarks
const parseRemarks = (remarks: string, expectedParts = 3): string[] => {
  if (!remarks || remarks === '-') {
    return Array(expectedParts).fill('-');
  }
  const parts = remarks.split(/\||,/).map(s => s.trim());
  while (parts.length < expectedParts) {
    parts.push('-');
  }
  return parts.slice(0, expectedParts);
};

interface ISurveyReportPdfData {
  report: any;
  vessel: any;
  equipmentRecords: any[];
  nominatedDeparturePoint?: string;
  qrBuffer?: Buffer;
}

export const createSurveyReportPdfBuffer = async (data: ISurveyReportPdfData): Promise<Buffer> => {
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
    if (!fs.existsSync(logoPath)) {
      logoPath = path.join(__dirname, '../../src/public/logo.png');
    }

    const { report, vessel, equipmentRecords, nominatedDeparturePoint, qrBuffer } = data;
    const firstEntryReport = report?.firstEntrySurveyReportId;
    const booking = firstEntryReport?.bookingId;

    // Helper to find equipment record by description
    const findRecord = (codeRefNo: string, descKeywords: string[]) => {
      return equipmentRecords.find(r => {
        const q = r.questionId;
        if (!q) return false;
        return q.codeRefNo === codeRefNo && descKeywords.every(k => q.description.toLowerCase().includes(k.toLowerCase()));
      });
    };

    // Draw page header
    const drawPageHeader = (titleText: string) => {
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, PAGE_MARGIN, PAGE_MARGIN - 5, { width: 45 });
        }
      } catch (err) {
        console.warn('Could not load logo image:', err);
      }

      doc.y = PAGE_MARGIN;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#1f4e79')
        .text('UNIVERSAL QUALITY MANAGEMENT SYSTEMS (PVT) LTD', PAGE_MARGIN + 55, PAGE_MARGIN, {
          width: doc.page.width - PAGE_MARGIN * 2 - 55,
          align: 'center',
        });

      doc.moveDown(0.2);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#4b5563')
        .text('No; 08, Chandralekha Mawatha, Colombo 08, Sri Lanka.', {
          width: doc.page.width - PAGE_MARGIN * 2 - 55,
          align: 'center',
        });

      const ruleY = PAGE_MARGIN + 45;
      doc
        .moveTo(innerLeft, ruleY)
        .lineTo(innerLeft + pageWidth, ruleY)
        .strokeColor('#5c93c4')
        .lineWidth(0.8)
        .stroke();

      doc.y = ruleY + 12;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#111827')
        .text(titleText, innerLeft, doc.y, { align: 'center' });

      doc.moveDown(1);
      return doc.y;
    };

    // Draw table cell helper
    const drawTableCell = (
      x: number,
      y: number,
      width: number,
      height: number,
      text: string,
      align: 'left' | 'center' | 'right' = 'left',
      isHeader = false
    ) => {
      doc.save();
      if (isHeader) {
        doc.rect(x, y, width, height).fillColor('#f3f4f6').fillAndStroke('#e5e7eb', '#d1d5db');
      } else {
        doc.rect(x, y, width, height).strokeColor('#e5e7eb').stroke();
      }
      doc.restore();

      doc
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor('#111827');

      doc.text(text || '-', x + 6, y + (height - 8) / 2, {
        width: width - 12,
        align,
        lineBreak: true,
        ellipsis: true,
      });
    };

    // ────────────────────────────────────────────────────────
    // PAGE 1: PART A - VESSEL PARTICULARS & DETAILS
    // ────────────────────────────────────────────────────────
    let currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART A – VESSEL PARTICULARS & DETAILS', innerLeft, doc.y, { align: 'center' });
    doc.moveDown(0.8);
    currentY = doc.y;

    // Draw Top particulars box
    doc.rect(innerLeft, currentY, pageWidth, 135).strokeColor('#d1d5db').lineWidth(1).stroke();

    // Left column fields
    const leftFields = [
      { label: 'Name of Vessel', val: vessel?.vesselName },
      { label: 'Call Sign', val: vessel?.callSign },
      { label: 'IMO/MMSI No', val: vessel?.imoNumber },
      { label: 'Official Number', val: booking?.officialNo || vessel?.imoNumber },
      { label: 'Certificate Number', val: report?.certificateNumber },
      { label: 'Flag of Registry', val: vessel?.flag || booking?.flag },
      { label: 'Port of Registry', val: vessel?.portOfRegistry || booking?.portOfRegistry }
    ];

    let fieldY = currentY + 8;
    leftFields.forEach(f => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1f4e79').text(f.label, innerLeft + 10, fieldY);
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827').text(`: ${f.val || '-'}`, innerLeft + 120, fieldY, { width: 220, ellipsis: true });
      fieldY += 17;
    });

    // Right column: QR Code
    if (qrBuffer) {
      try {
        doc.image(qrBuffer, innerLeft + 390, currentY + 15, { width: 90 });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#4b5563').text('Verification QR Code', innerLeft + 390, currentY + 110, { width: 90, align: 'center' });
      } catch (err) {
        console.error('Error drawing QR Code:', err);
      }
    }

    currentY += 145;

    // Middle section: Owner, Manager, Builder
    doc.rect(innerLeft, currentY, pageWidth, 90).strokeColor('#d1d5db').lineWidth(1).stroke();

    // Vertical split lines
    doc.moveTo(innerLeft + 171, currentY).lineTo(innerLeft + 171, currentY + 90).strokeColor('#d1d5db').stroke();
    doc.moveTo(innerLeft + 342, currentY).lineTo(innerLeft + 342, currentY + 90).strokeColor('#d1d5db').stroke();

    // Owner
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f4e79').text('Owner Details', innerLeft + 10, currentY + 8);
    const ownerName = vessel?.registeredOwnerName || '-';
    const ownerAddr = vessel?.registeredOwnerAddress || '-';
    doc.font('Helvetica').fontSize(8).fillColor('#111827').text(`${ownerName}\n${ownerAddr}`, innerLeft + 10, currentY + 22, { width: 151, height: 60, lineGap: 1.5, ellipsis: true });

    // Manager
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f4e79').text('Manager Details', innerLeft + 181, currentY + 8);
    const managerName = vessel?.managerName || booking?.managedBy || firstEntryReport?.managedBy || '-';
    const managerAddr = vessel?.managerAddress || '-';
    doc.font('Helvetica').fontSize(8).fillColor('#111827').text(`${managerName}\n${managerAddr}`, innerLeft + 181, currentY + 22, { width: 151, height: 60, lineGap: 1.5, ellipsis: true });

    // Builder
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f4e79').text('Builder Details', innerLeft + 352, currentY + 8);
    const builderName = vessel?.builder || booking?.shipBuilder || '-';
    const builderAddr = vessel?.placeOfBuilt || '-';
    doc.font('Helvetica').fontSize(8).fillColor('#111827').text(`${builderName}\n${builderAddr}`, innerLeft + 352, currentY + 22, { width: 153, height: 60, lineGap: 1.5, ellipsis: true });

    currentY += 100;

    // Other particulars
    doc.rect(innerLeft, currentY, pageWidth, 115).strokeColor('#d1d5db').lineWidth(1).stroke();

    const middleFields1 = [
      { label: 'Date of Build', val: formatDate(vessel?.dateOfBuild || booking?.buildDate) },
      { label: 'Yard Number', val: vessel?.yardNo || booking?.yardNo },
      { label: 'Hull Material', val: vessel?.material },
      { label: 'Vessel Group', val: vessel?.vesselType?.group || '-' }
    ];

    const middleFields2 = [
      { label: 'Vessel Type', val: vessel?.vesselType?.name || '-' },
      { label: 'Operational Areas', val: vessel?.areaOfOperation?.description || '-' },
      { label: 'Departure Point', val: nominatedDeparturePoint || '-' },
      { label: 'Category 4 or 5', val: vessel?.areaOfOperation?.AreaCategory || '-' }
    ];

    let midY = currentY + 8;
    for (let idx = 0; idx < 4; idx++) {
      // Left
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1f4e79').text(middleFields1[idx].label, innerLeft + 10, midY);
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827').text(`: ${middleFields1[idx].val || '-'}`, innerLeft + 120, midY, { width: 130, ellipsis: true });

      // Right
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1f4e79').text(middleFields2[idx].label, innerLeft + 265, midY);
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827').text(`: ${middleFields2[idx].val || '-'}`, innerLeft + 375, midY, { width: 130, ellipsis: true });

      midY += 26;
    }

    currentY += 125;

    // Dimensions Table
    const dimWidths = [73, 73, 73, 73, 75, 75, 73]; // Total 515
    const dimHeaders = ['LOA', 'Breadth', 'Depth', 'Draught', 'Gross Tonnage', 'Net Tonnage', 'Service Speed'];
    const dimVals = [
      vessel?.overallLength ? `${vessel.overallLength} m` : '-',
      vessel?.breadth ? `${vessel.breadth} m` : '-',
      vessel?.depth ? `${vessel.depth} m` : '-',
      vessel?.draught ? `${vessel.draught} m` : '-',
      (vessel?.grossTonnage || booking?.gt) ? `${vessel.grossTonnage || booking.gt} RT` : '-',
      vessel?.netTonnage ? `${vessel.netTonnage} RT` : '-',
      vessel?.speed ? `${vessel.speed} Knots` : '-'
    ];

    let dimX = innerLeft;
    for (let idx = 0; idx < 7; idx++) {
      drawTableCell(dimX, currentY, dimWidths[idx], 18, dimHeaders[idx], 'center', true);
      dimX += dimWidths[idx];
    }
    currentY += 18;

    dimX = innerLeft;
    for (let idx = 0; idx < 7; idx++) {
      drawTableCell(dimX, currentY, dimWidths[idx], 20, dimVals[idx], 'center', false);
      dimX += dimWidths[idx];
    }
    currentY += 35;

    // Capacities Section
    const capWidths = [171, 171, 173]; // Total 515
    const capHeaders = ['Total Persons Onboard', 'Maximum Number of Passengers', 'Minimum Manning of Vessel'];
    const capVals = [
      String(report?.totalPersonsOnboard ?? 0),
      String(report?.maxPassengers ?? 0),
      String(report?.minManning ?? 0)
    ];

    let capX = innerLeft;
    for (let idx = 0; idx < 3; idx++) {
      drawTableCell(capX, currentY, capWidths[idx], 18, capHeaders[idx], 'center', true);
      capX += capWidths[idx];
    }
    currentY += 18;

    capX = innerLeft;
    for (let idx = 0; idx < 3; idx++) {
      drawTableCell(capX, currentY, capWidths[idx], 20, capVals[idx], 'center', false);
      capX += capWidths[idx];
    }

    // ────────────────────────────────────────────────────────
    // PAGE 2: PART B - RECORD OF EQUIPMENT
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART B – RECORD OF EQUIPMENT', innerLeft, doc.y, { align: 'center' });
    doc.moveDown(0.8);
    currentY = doc.y;

    const colWidthsRecord = [60, 235, 80, 140]; // Total 515
    const drawRecordHeader = (y: number) => {
      let x = innerLeft;
      drawTableCell(x, y, colWidthsRecord[0], 20, 'Code Ref', 'center', true);
      x += colWidthsRecord[0];
      drawTableCell(x, y, colWidthsRecord[1], 20, 'Description', 'left', true);
      x += colWidthsRecord[1];
      drawTableCell(x, y, colWidthsRecord[2], 20, 'Status', 'center', true);
      x += colWidthsRecord[2];
      drawTableCell(x, y, colWidthsRecord[3], 20, 'Remarks', 'left', true);
    };

    drawRecordHeader(currentY);
    currentY += 20;

    const rowHeight = 22;

    // Sort contiguous rows by codeRefNo
    const sortedRecords = [...equipmentRecords].sort((a, b) => {
      const refA = a.questionId?.codeRefNo || '';
      const refB = b.questionId?.codeRefNo || '';
      return refA.localeCompare(refB, undefined, { numeric: true, sensitivity: 'base' });
    });

    let groupStartY = currentY;
    let currentGroupRef = '';

    const drawCodeRefCell = (startY: number, endY: number, refText: string) => {
      const height = endY - startY;
      const x = innerLeft;
      const width = colWidthsRecord[0];

      doc.save();
      doc.rect(x, startY, width, height).strokeColor('#e5e7eb').stroke();
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
      doc.text(refText || '-', x, startY + (height - 8) / 2, {
        width: width,
        align: 'center',
        lineBreak: false,
      });
    };

    for (let i = 0; i < sortedRecords.length; i++) {
      const rec = sortedRecords[i];
      const q = rec.questionId;
      const ref = q?.codeRefNo || '';
      const descText = q?.description || '';
      const statusText = rec.status || 'Not Provided';

      let remarksText = rec.remarks || '-';
      if (remarksText.startsWith('ROWS:')) {
        remarksText = 'Extinguisher locations & sizes detailed in Part C';
      } else if (remarksText.startsWith('RAFTS:')) {
        remarksText = 'Life raft particulars detailed in Part C';
      }

      // If we are starting a new group
      if (ref !== currentGroupRef) {
        if (currentGroupRef !== '') {
          drawCodeRefCell(groupStartY, currentY, currentGroupRef);
        }
        currentGroupRef = ref;
        groupStartY = currentY;
      }

      // Check for page break
      if (currentY + rowHeight > doc.page.height - PAGE_MARGIN - 35) {
        drawCodeRefCell(groupStartY, currentY, currentGroupRef);

        doc.addPage();
        currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART B – RECORD OF EQUIPMENT (CONTINUED)', innerLeft, doc.y, { align: 'center' });
        doc.moveDown(0.8);
        currentY = doc.y;

        drawRecordHeader(currentY);
        currentY += 20;

        groupStartY = currentY;
      }

      let rx = innerLeft + colWidthsRecord[0];

      // Description
      drawTableCell(rx, currentY, colWidthsRecord[1], rowHeight, descText, 'left', false);
      rx += colWidthsRecord[1];

      // Status
      drawTableCell(rx, currentY, colWidthsRecord[2], rowHeight, statusText, 'center', false);
      rx += colWidthsRecord[2];

      // Remarks
      drawTableCell(rx, currentY, colWidthsRecord[3], rowHeight, remarksText, 'left', false);

      currentY += rowHeight;
    }

    if (currentGroupRef !== '') {
      drawCodeRefCell(groupStartY, currentY, currentGroupRef);
    }

    // ────────────────────────────────────────────────────────
    // PAGE 3+: PART C - SURVEY REPORT (HULL & DOCKING)
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART C – SURVEY REPORT', innerLeft, doc.y, { align: 'center' });
    doc.moveDown(0.8);
    currentY = doc.y;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('HULL:', innerLeft, currentY);
    currentY += 16;

    // Stability Booklet
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text('Stability booklet.', innerLeft, currentY);
    currentY += 14;

    const sbAvailable = report?.stabilityBooklet?.available ? 'available onboard' : 'not available onboard';
    const sbApprovedBy = report?.stabilityBooklet?.approvedBy || 'BUREAU VERITAS';
    const sbApprovalDate = report?.stabilityBooklet?.approvalDate ? formatDate(report.stabilityBooklet.approvalDate) : '03rd January 2012';
    const stabilityText = `Stability booklet ${sbAvailable}. Stability book has been approved by ${sbApprovedBy} on ${sbApprovalDate}.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(stabilityText, innerLeft, currentY, { width: pageWidth, align: 'justify' });
    currentY += doc.heightOfString(stabilityText, { width: pageWidth }) + 15;

    // Docking Details
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('DOCKING SURVEY DETAILS:', innerLeft, currentY);
    currentY += 16;

    const dockHarbour = report?.dockingSurvey?.harbour || 'Dikkowita Fisheries Harbour';
    const dockDate = report?.dockingSurvey?.date ? formatDate(report.dockingSurvey.date) : '08th February 2026';
    const dockingText = `The most recent bottom survey was carried out during the vessel’s dry docking at the ${dockHarbour} on ${dockDate}, in the presence of and duly witnessed by a UQMS appointed Surveyor.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(dockingText, innerLeft, currentY, { width: pageWidth, align: 'justify' });
    currentY += doc.heightOfString(dockingText, { width: pageWidth }) + 15;

    // Thickness Measurement
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('THICKNESS MEASUREMENT DETAILS:', innerLeft, currentY);
    currentY += 16;

    const tmCarriedBy = report?.thicknessMeasurement?.carriedBy || 'Lanka High Marine (Pvt) Ltd.';
    const tmHarbour = report?.thicknessMeasurement?.harbour || 'Dikkowita Fisheries Harbour';
    const tmDate = report?.thicknessMeasurement?.date ? formatDate(report.thicknessMeasurement.date) : '08th February 2026';
    const tmReportNo = report?.thicknessMeasurement?.reportNo || 'LHT-SB-TM-25-03-1874';
    
    const thicknessText = `Thickness measurements were carried out by ${tmCarriedBy} at the ${tmHarbour} on ${tmDate} under the verification of a UQMS Surveyor. The relevant Thickness Measurement Report (Report No. ${tmReportNo}) was reviewed at the time of survey.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(thicknessText, innerLeft, currentY, { width: pageWidth, align: 'justify' });
    currentY += doc.heightOfString(thicknessText, { width: pageWidth }) + 15;

    // Inspection checklist (Filtered by checked items)
    const activeInspections = report?.hullInspections && report.hullInspections.length > 0
      ? report.hullInspections
      : defaultInspections;

    const hullCond = report?.hullStructureCondition || 'satisfactory';
    const inspectionIntro = `The hull structure and its closing appliances were examined and found to be in ${hullCond} condition.\nThis includes the inspection of:\n` +
      activeInspections.map((item: string) => `• ${item}`).join('\n');

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3).text(inspectionIntro, innerLeft, currentY, { width: pageWidth, align: 'justify' });
    currentY += doc.heightOfString(inspectionIntro, { width: pageWidth }) + 15;

    // Main Deck
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('MAIN DECK/FORECASTLE:', innerLeft, currentY);
    currentY += 16;

    const deckCoating = report?.mainDeck?.coatingCondition || 'Good';
    const deckStructure = report?.mainDeck?.structureCondition || 'satisfactory';
    const mainDeckText = `Coating condition on Main deck, Monkey Island were found in ‘${deckCoating}’ condition & Structure found ${deckStructure}.`;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(mainDeckText, innerLeft, currentY);

    // ────────────────────────────────────────────────────────
    // PAGE 4: ACCESS OPENINGS, TANKS & SPACES
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART C – SURVEY REPORT (CONTINUED)', innerLeft, doc.y, { align: 'center' });
    doc.moveDown(0.8);
    currentY = doc.y;

    // Access Openings
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('ACCESS OPENINGS & VENTILATIONS:', innerLeft, currentY);
    currentY += 16;
    
    const accessOpen = report?.accessOpeningsCondition || 'satisfactory';
    const accessText = `General examination carried out. Engine room maintenance hatches, Engine room emergency escape hatch, Accommodation space escape hatch and other accommodation ventilation port hole condition found ${accessOpen} with efficient weather tightness.`;
    
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(accessText, innerLeft, currentY, { width: pageWidth, align: 'justify' });
    currentY += doc.heightOfString(accessText, { width: pageWidth }) + 15;

    // Tanks
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('TANKS:', innerLeft, currentY);
    currentY += 16;

    const tankPName = report?.tanks?.fuelOilPortName || 'P';
    const tankPFrame = report?.tanks?.fuelOilPortFrame || 'Fr. 10 – 12';
    const tankPCond = report?.tanks?.fuelOilPortCondition || 'satisfactory';

    const tankSName = report?.tanks?.fuelOilStarboardName || 'S';
    const tankSFrame = report?.tanks?.fuelOilStarboardFrame || 'Fr. 10 – 12';
    const tankSCond = report?.tanks?.fuelOilStarboardCondition || 'satisfactory';

    const tankCName = report?.tanks?.freshWaterCenterName || 'C';
    const tankCFrame = report?.tanks?.freshWaterCenterFrame || 'Fr. 12 – 13';
    const tankCCond = report?.tanks?.freshWaterCenterCondition || 'satisfactory';

    const tanksText = `Fuel Oil Tank (${tankPName}) – Between ${tankPFrame}\nTank external examination carried out to ${tankPCond}. Remote Quick closing valve tested.\n\n` +
      `Fuel Oil Tank (${tankSName}) – Between ${tankSFrame}\nTank external examination carried out to ${tankSCond}. Remote Quick closing valve tested.\n\n` +
      `Fresh Water Tanks (${tankCName}) - Between ${tankCFrame}\nExternal examination carried out to ${tankCCond}.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(tanksText, innerLeft, currentY, { width: pageWidth, align: 'justify' });
    currentY += doc.heightOfString(tanksText, { width: pageWidth }) + 15;

    // Spaces
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('SPACES:', innerLeft, currentY);
    currentY += 16;

    const spaceMach = report?.spaces?.machinerySpace || 'Satisfactory';
    const spaceSteer = report?.spaces?.steeringGear || 'Satisfactory';
    const spaceOper = report?.spaces?.operatingStation || 'Satisfactory';
    const spaceAccom = report?.spaces?.accommodation || 'Satisfactory';

    const spacesText = `Machinery Space\nCleanliness found ${spaceMach}.\n\n` +
      `Steering Gear Spaces\nCleanliness found ${spaceSteer}.\n\n` +
      `Operating Station\nFound ${spaceOper}.\n\n` +
      `Accommodation Spaces\nCleanliness found ${spaceAccom}.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(spacesText, innerLeft, currentY, { width: pageWidth, align: 'justify' });
    currentY += doc.heightOfString(spacesText, { width: pageWidth }) + 15;

    // Toilet
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('TOILET:', innerLeft, currentY);
    currentY += 16;
    const toiletText = `${report?.toiletCount || 1} Toilet available.`;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(toiletText, innerLeft, currentY);
    currentY += 25;

    // Wheel House
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('WHEEL HOUSE/ OPERATING STATION & PASSENGER SEATING AREA:', innerLeft, currentY);
    currentY += 16;
    
    const whStruct = report?.wheelhouse?.structureCondition || 'satisfactory';
    const whSeat = report?.wheelhouse?.passengerSeatingCondition || 'good';
    const whText = `The vessel’s structure was found to be ${whStruct}. The condition of passenger seating was found to be ${whSeat}.`;
    
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(whText, innerLeft, currentY, { width: pageWidth });
    currentY += 25;

    // Galley
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('GALLEY:', innerLeft, currentY);
    currentY += 16;
    const galleyText = report?.galleyRemarks || 'No galley was found onboard at the time of inspection.';
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(galleyText, innerLeft, currentY, { width: pageWidth });

    // ────────────────────────────────────────────────────────
    // PAGE 5: BRIDGE OUTFIT & FIRE FIGHTING TABLES
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART C – SURVEY REPORT (CONTINUED)', innerLeft, doc.y, { align: 'center' });
    doc.moveDown(0.8);
    currentY = doc.y;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('BRIDGE OUTFIT:', innerLeft, currentY);
    currentY += 14;

    const bridgeIntro = `Available Bridge navigation & radio equipment generally inspected and Operation verified to satisfaction. Following Navigational & radio equipment found on the bridge;`;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(bridgeIntro, innerLeft, currentY, { width: pageWidth });
    currentY += 22;

    // Bridge Outfit Table
    const compassRec = findRecord('13.1', ['Compass']);
    const radarRec = findRecord('13.1', ['Radar']);
    const vhfRec = findRecord('13.1', ['VHF Fixed']);
    const aisRec = findRecord('13.1', ['AIS']);

    const compassParts = parseRemarks(compassRec?.remarks || 'Plastimo | OFFSHORE 135 | BV 0062');
    const radarParts = parseRemarks(radarRec?.remarks || 'Furuno | MFD 12 | 4368-1294');
    const vhfParts = parseRemarks(vhfRec?.remarks || 'Furuno | FM-8800S | 3519-Ala2');
    const aisParts = parseRemarks(aisRec?.remarks || 'Sunhung | SH- 820 | 5H 8201 10917');

    const colWidthsB = [135, 120, 110, 150]; // Total 515
    const drawBridgeHeader = (y: number) => {
      let x = innerLeft;
      drawTableCell(x, y, colWidthsB[0], 20, 'Equipment', 'left', true);
      x += colWidthsB[0];
      drawTableCell(x, y, colWidthsB[1], 20, 'Manufacture', 'left', true);
      x += colWidthsB[1];
      drawTableCell(x, y, colWidthsB[2], 20, 'Type', 'left', true);
      x += colWidthsB[2];
      drawTableCell(x, y, colWidthsB[3], 20, 'Serial Number', 'left', true);
    };

    const drawBridgeRow = (y: number, eq: string, parts: string[]) => {
      let x = innerLeft;
      drawTableCell(x, y, colWidthsB[0], 18, eq, 'left');
      x += colWidthsB[0];
      drawTableCell(x, y, colWidthsB[1], 18, parts[0], 'left');
      x += colWidthsB[1];
      drawTableCell(x, y, colWidthsB[2], 18, parts[1], 'left');
      x += colWidthsB[2];
      drawTableCell(x, y, colWidthsB[3], 18, parts[2], 'left');
    };

    drawBridgeHeader(currentY);
    currentY += 20;

    drawBridgeRow(currentY, 'Magnetic Compass', compassParts);
    currentY += 18;
    drawBridgeRow(currentY, 'Radar', radarParts);
    currentY += 18;
    drawBridgeRow(currentY, 'VHF', vhfParts);
    currentY += 18;
    drawBridgeRow(currentY, 'AIS Transponder', aisParts);
    currentY += 30;

    // Safety Equipment Intro
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('SAFETY EQUIPMENT:', innerLeft, currentY);
    currentY += 14;
    const safetyIntro = `Safety equipment and Fire Fighting Appliances available on board generally examined. Operation verified to satisfaction.`;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(safetyIntro, innerLeft, currentY, { width: pageWidth });
    currentY += 20;

    // Fire Fighting Equipment
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text('Fire Fighting Equipment:', innerLeft, currentY);
    currentY += 14;
    
    const feRec = findRecord('11.8', ['Portable fire extinguishers']);
    const extinguishersText = feRec?.remarks || '';
    
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(`Portable fire extinguishing equipment – Total Six Nos.`, innerLeft, currentY);
    currentY += 16;

    // Fire Extinguishers Table
    const colWidthsF = [115, 30, 45, 60, 95, 170]; // Total 515
    const drawFireHeader = (y: number) => {
      let x = innerLeft;
      drawTableCell(x, y, colWidthsF[0], 20, 'Location', 'left', true);
      x += colWidthsF[0];
      drawTableCell(x, y, colWidthsF[1], 20, 'Nos', 'center', true);
      x += colWidthsF[1];
      drawTableCell(x, y, colWidthsF[2], 20, 'Type', 'center', true);
      x += colWidthsF[2];
      drawTableCell(x, y, colWidthsF[3], 20, 'Capacity', 'center', true);
      x += colWidthsF[3];
      drawTableCell(x, y, colWidthsF[4], 20, 'Last Serviced date', 'center', true);
      x += colWidthsF[4];
      drawTableCell(x, y, colWidthsF[5], 20, 'Serviced by', 'left', true);
    };

    const drawFireRow = (y: number, loc: string, nos: string, type: string, cap: string, date: string, srv: string) => {
      let x = innerLeft;
      drawTableCell(x, y, colWidthsF[0], 18, loc, 'left');
      x += colWidthsF[0];
      drawTableCell(x, y, colWidthsF[1], 18, nos, 'center');
      x += colWidthsF[1];
      drawTableCell(x, y, colWidthsF[2], 18, type, 'center');
      x += colWidthsF[2];
      drawTableCell(x, y, colWidthsF[3], 18, cap, 'center');
      x += colWidthsF[3];
      drawTableCell(x, y, colWidthsF[4], 18, date, 'center');
      x += colWidthsF[4];
      drawTableCell(x, y, colWidthsF[5], 18, srv, 'left');
    };

    drawFireHeader(currentY);
    currentY += 20;

    let fireRows = [
      { location: 'Operating station', nos: '1', type: 'DCP', capacity: '3.5 kg', date: '17/07/2025', servicedBy: 'SHM Shipcare Pvt Ltd' },
      { location: 'Steering room', nos: '1', type: 'DCP', capacity: '3.5 kg', date: '17/07/2025', servicedBy: 'SHM Shipcare Pvt Ltd' },
      { location: 'Accommodation', nos: '1', type: 'DCP', capacity: '3.5 kg', date: '17/07/2025', servicedBy: 'SHM Shipcare Pvt Ltd' },
      { location: 'Engine room', nos: '2', type: 'DCP', capacity: '3.5 kg', date: '17/07/2025', servicedBy: 'SHM Shipcare Pvt Ltd' },
      { location: 'Engine room', nos: '2', type: 'CO2', capacity: '6.8 kg', date: '17/07/2025', servicedBy: 'SHM Shipcare Pvt Ltd' },
    ];

    if (extinguishersText && extinguishersText.startsWith('ROWS:')) {
      try {
        fireRows = extinguishersText.substring(5).split(';').map((rowStr: string) => {
          const p = rowStr.split(',');
          return {
            location: p[0] || '',
            nos: p[1] || '',
            type: p[2] || '',
            capacity: p[3] || '',
            date: p[4] || '',
            servicedBy: p[5] || '',
          };
        });
      } catch (e) {
        // use default
      }
    }

    fireRows.forEach(row => {
      drawFireRow(currentY, row.location, row.nos, row.type, row.capacity, row.date, row.servicedBy);
      currentY += 18;
    });
    currentY += 6;

    const fireExtNote = `All portable extinguishers fully charged and in their stowed position and with valid service dates.\n` +
      `Last Service Date: 17/07/2025\n` +
      `Serviced Firm: SHM Shipcare Pvt Ltd`;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#4b5563').lineGap(2.5).text(fireExtNote, innerLeft, currentY);

    // ────────────────────────────────────────────────────────
    // PAGE 6: LIFE RAFT (CONT), PYROTECHNICS & ENGINES
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART C – SURVEY REPORT (CONTINUED)', innerLeft, doc.y, { align: 'center' });
    doc.moveDown(0.8);
    currentY = doc.y;

    // Life Saving introduction
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text('Life Saving Equipment:', innerLeft, currentY);
    currentY += 14;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text('Following lifesaving equipment available onboard.', innerLeft, currentY);
    currentY += 15;

    // Life Raft Details
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text('Life Raft', innerLeft, currentY);
    currentY += 14;

    const lrRec = findRecord('11.4', ['Life rafts']);
    const lrRemarks = lrRec?.remarks || '';
    let lrDetails = {
      quantity: lrRec?.status === 'Provided' ? '1' : '0',
      capacity: '20',
      manufacturer: 'Shanghai Youlong Rubber Products Co. Ltd.',
      packType: 'A-Pack',
      serialNumber: 'l 5693',
      lastInspectionDate: '17/07/25',
      serviceProvider: 'SHM Shipcare Pvt Ltd',
    };

    if (lrRemarks.startsWith('RAFTS:')) {
      try {
        const p = lrRemarks.substring(6).split(',');
        lrDetails = {
          quantity: p[0] || '',
          capacity: p[1] || '',
          manufacturer: p[2] || '',
          packType: p[3] || '',
          serialNumber: p[4] || '',
          lastInspectionDate: p[5] || '',
          serviceProvider: p[6] || '',
        };
      } catch (e) {
        // use default
      }
    }

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(
      `Number of Quantity: ${lrDetails.quantity} Nos\n` +
      `Capacity: ${lrDetails.capacity} Passengers\n` +
      `Manufacture: ${lrDetails.manufacturer}\n` +
      `Type: ${lrDetails.packType}\n` +
      `Serial No: ${lrDetails.serialNumber}\n` +
      `Last Inspection Date: ${lrDetails.lastInspectionDate}\n` +
      `Service Provider: ${lrDetails.serviceProvider}`,
      innerLeft + 10,
      currentY
    );
    currentY += 110;

    // Life Buoys
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('Life Buoys', innerLeft, currentY);
    currentY += 14;
    const lbText = `Complete in number (as per SCC 2025) and good condition.\n` +
      `Marked all in block letters with name and port of registry of ship.\n` +
      `Fitted with retro reflective materials.`;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3).text(lbText, innerLeft + 10, currentY);
    currentY += 50;

    // Life Jackets
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('Life Jackets', innerLeft, currentY);
    currentY += 14;

    const ljCond = report?.lifeJacketsCondition || 'satisfactory';
    const ljText = `When checked for proper stowage, a random examination of the condition of the life jackets gave ${ljCond} results.\n` +
      `Each jacket of international or vivid orange or comparable highly visible colour and fitted with retro-reflective materials.\n` +
      `Life jackets light batteries within valid expiry date.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3).text(ljText, innerLeft + 10, currentY);
    currentY += 65;

    // Pyrotechnics
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('Pyrotechnics', innerLeft, currentY);
    currentY += 14;

    const flareRec = findRecord('11.10', ['Parachute flares']);
    const redFlareRec = findRecord('11.10', ['Red hand flares']);
    const smokeRec = findRecord('11.10', ['Smoke Signals']);

    const getExpiry = (remarks: string) => {
      const match = remarks.match(/Expiry:\s*([^\s]+)/i);
      return match ? match[1] : '08/2027';
    };

    const getQty = (remarks: string, defaultQty: string) => {
      const match = remarks.match(/^([^\.\s]+)/);
      if (!match) return defaultQty;
      const textMap: Record<string, string> = {
        one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10'
      };
      const cleaned = match[1].toLowerCase().trim();
      return textMap[cleaned] || cleaned;
    };

    const flareExp = getExpiry(flareRec?.remarks || '');
    const redFlareExp = getExpiry(redFlareRec?.remarks || '');
    const smokeExp = getExpiry(smokeRec?.remarks || '');

    const flareQty = getQty(flareRec?.remarks || '', '2');
    const redFlareQty = getQty(redFlareRec?.remarks || '', '4');
    const smokeQty = getQty(smokeRec?.remarks || '', '2');

    // Pyrotechnics Table
    const colWidthsP = [215, 100, 200]; // Total 515
    const drawPyroHeader = (y: number) => {
      let x = innerLeft;
      drawTableCell(x, y, colWidthsP[0], 20, 'Item', 'left', true);
      x += colWidthsP[0];
      drawTableCell(x, y, colWidthsP[1], 20, 'Nos', 'center', true);
      x += colWidthsP[1];
      drawTableCell(x, y, colWidthsP[2], 20, 'Expiry date', 'center', true);
    };

    const drawPyroRow = (y: number, item: string, nos: string, exp: string) => {
      let x = innerLeft;
      drawTableCell(x, y, colWidthsP[0], 18, item, 'left');
      x += colWidthsP[0];
      drawTableCell(x, y, colWidthsP[1], 18, nos, 'center');
      x += colWidthsP[1];
      drawTableCell(x, y, colWidthsP[2], 18, exp, 'center');
    };

    drawPyroHeader(currentY);
    currentY += 20;

    drawPyroRow(currentY, 'Hand Flares', redFlareQty, redFlareExp);
    currentY += 18;
    drawPyroRow(currentY, 'Rocket Parachute', flareQty, flareExp);
    currentY += 18;
    drawPyroRow(currentY, 'Smoke Signal', smokeQty, smokeExp);

    // ────────────────────────────────────────────────────────
    // PAGE 7: MACHINERY, PIPING, ELECTRICAL & SIGNATURES
    // ────────────────────────────────────────────────────────
    doc.addPage();
    currentY = drawPageHeader('RECORD OF EQUIPMENT & SURVEY REPORT');
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f4e79').text('PART C – SURVEY REPORT (CONTINUED)', innerLeft, doc.y, { align: 'center' });
    doc.moveDown(0.8);
    currentY = doc.y;

    // Mooring Equipment
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('MOORING EQUIPMENT:', innerLeft, currentY);
    currentY += 14;
    const mooringText = `The condition of the anchoring and mooring equipment is satisfactory.\n` +
      `Mooring & Grounding tackle examined operational tested and found satisfactory.\n` +
      `Sea inlets and discharged arrangement as far as practicable.`;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3).text(mooringText, innerLeft, currentY, { width: pageWidth });
    currentY += 55;

    // Machinery - Main Engine
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('MACHINERY:', innerLeft, currentY);
    currentY += 16;
    
    const mainEngCount = report?.machinery?.mainEngineCount ?? (vessel?.noOfEngines || 2);
    const mainEngModel = report?.machinery?.mainEngineModel || (vessel?.mainEngineModel || 'Caterpillar');
    const mainEngPower = report?.machinery?.mainEnginePower || (vessel?.totalPower ? `${vessel.totalPower}kW (${Math.round(vessel.totalPower * 1.341)} HP)` : '714kW (970 HP)');
    const mainEngFuel = report?.machinery?.mainEngineFuelType || 'Diesel';
    const mainEngAlarms = report?.machinery?.mainEngineAlarms || 'satisfaction';

    const mainEngineText = `Main Engine (${mainEngCount} Nos)\n\n` +
      `Type/ Model: ${mainEngModel}\n` +
      `Output: ${mainEngPower}\n` +
      `Fuel Type: ${mainEngFuel}\n` +
      `Main engines safety alarms/ shutdowns and operation tested to ${mainEngAlarms}.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(mainEngineText, innerLeft, currentY, { width: pageWidth });
    currentY += 110;

    // Auxiliary Engine
    const auxCount = report?.machinery?.auxEngineCount ?? 0;
    const auxModel = report?.machinery?.auxEngineModel || 'Caterpillar';
    const auxOutput = report?.machinery?.auxEngineOutput || '17KW';
    const auxAlarms = report?.machinery?.auxEngineAlarms || 'satisfaction';

    const auxEngineText = `Aux. (Gen.) Engine (${auxCount} Nos)\n` +
      `Model: ${auxModel}\n` +
      `Output: ${auxOutput}\n` +
      `Auxiliary engines safety alarms/ shutdowns and operation tested to ${auxAlarms}.`;

    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3.5).text(auxEngineText, innerLeft, currentY, { width: pageWidth });
    currentY += 75;

    // Piping
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('Piping', innerLeft, currentY);
    currentY += 14;
    
    const pipeCond = report?.pipingCondition || 'satisfactory';
    const pipingText = `General examination carried in working condition and found ${pipeCond}.`;
    
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(pipingText, innerLeft, currentY);
    currentY += 25;

    // Electrical
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4e79').text('ELECTRICAL SYSTEMS', innerLeft, currentY);
    currentY += 14;
    
    const elecExam = report?.electricalExamCondition || 'as far as practicable';
    const electricalText = `The electrical equipment and cabling forming the main and emergency electrical installations have been generally examined under operation condition ${elecExam}.\n\n` +
      `Power Generation: ${report?.machinery?.powerGeneration || '6x200Ah,12V'}`;
    
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151').lineGap(3).text(electricalText, innerLeft, currentY, { width: pageWidth });
    currentY += doc.heightOfString(electricalText, { width: pageWidth }) + 50;

    // Signature Block
    const issueDateStr = report?.signature?.dateOfIssue ? formatDate(report.signature.dateOfIssue) : '03 April 2026';
    const surveyorName = report?.signature?.surveyorName || 'S.A.P.M. SAMARASINGHE';
    const surveyorTitle = report?.signature?.surveyorTitle || 'Marine Surveyor';
    const certifyingBody = report?.signature?.certifyingBody || 'Universal Quality Management Systems (Pvt) Ltd.';

    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#111827')
      .text(`SIGNED: Date of issue: ${issueDateStr}`, innerLeft, currentY);
    
    currentY += 35;
    doc.text('....................................................................', innerLeft, currentY);
    
    currentY += 16;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111827')
      .text(surveyorName.toUpperCase(), innerLeft, currentY);
    
    currentY += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#4b5563').text(surveyorTitle, innerLeft, currentY);
    currentY += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#4b5563').text(certifyingBody, innerLeft, currentY);

    // ────────────────────────────────────────────────────────
    // APPLY FOOTERS TO ALL PAGES AT THE END
    // ────────────────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      
      const footerY = doc.page.height - PAGE_MARGIN - 20;
      
      // Draw horizontal line
      doc
        .moveTo(PAGE_MARGIN, footerY - 5)
        .lineTo(PAGE_MARGIN + pageWidth, footerY - 5)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();
        
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#4b5563')
        .text('RECORD OF EQUIPMENT & SURVEY REPORT', PAGE_MARGIN, footerY);
        
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#9ca3af')
        .text(
          `Page ${i + 1} of ${totalPages}`,
          PAGE_MARGIN,
          footerY,
          { width: pageWidth, align: 'right', lineBreak: false }
        );

      if (i === 0) {
        // Draw contact info on page 1 above the standard footer text
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor('#111827')
          .text('PHONE: +94 76 68 68 718     WEB: www.uqms.net     E-Mail: info@uqms.net', PAGE_MARGIN, footerY - 15);
      }
    }

    doc.end();
  });
};

const defaultInspections = [
  'Weather decks, hatchways, and other deck openings for watertight integrity.',
  'Ship side plating above the waterline, casings, skylights, and deckhouses.',
  'Superstructures, including end bulkheads, windows, scuttles, and deadlights.',
  'Openings such as garbage chutes, inlets, scuppers, and sanitary discharges.',
  'Guard rails, bulwarks, freeing ports (including those with shutters), walkways.',
  'Watertight and weather-tight doors were operationally tested and found satisfactory.',
  'Watertight bulkhead penetrations and the condition of collision and other watertight bulkheads were found satisfactory to the extent visible.',
  'Ventilators and air pipes, including their coamings, closing appliances, and deck welds, were inspected and found to be in satisfactory condition.',
  'Anchoring and mooring equipment, including the mooring and grounding tackle, were examined, function- tested, and found satisfactory.',
  'Sea inlets and discharge arrangements were verified as far as practicable and found to be in satisfactory condition.'
];
