import PDFDocument from 'pdfkit';
import path from 'path';

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

export const createDockingSurveyPdfBuffer = async (
  cert: any,
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

      // 3. Horizontal Rule
      const ruleY = PAGE_MARGIN + 60;
      doc
        .moveTo(innerLeft, ruleY)
        .lineTo(innerLeft + pageWidth, ruleY)
        .strokeColor('#5c93c4')
        .lineWidth(1)
        .stroke()
        .strokeColor('#000000')
        .lineWidth(1);

      return ruleY + 25;
    };

    // ────────────────────────────────────────────────────────
    // DRAW PAGE 1
    // ────────────────────────────────────────────────────────
    let currentY = drawHeader(0);

    // Title
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#111827')
      .text('DOCKING STATEMENT', innerLeft, currentY);

    currentY += 25;

    const vesselName = cert.vesselId?.vesselName || 'NICOLAS';

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    const labelW = 120;

    const metadataFields = [
      { label: 'Project Name', value: vesselName },
      { label: 'Certificate No.', value: cert.certificateNumber },
      { label: 'Client', value: cert.client || 'DOLPHINE MARINE COLOMBO (PVT) LTD (MANAGERS)' },
      { label: 'Survey Location', value: cert.surveyLocation || 'DIKKOWITA FISHERIES HARBOUR' },
      { label: 'Docking Period', value: `${formatDate(cert.dockingPeriodStart)} – ${formatDate(cert.dockingPeriodEnd)}` },
    ];

    metadataFields.forEach((field) => {
      doc.font('Helvetica').text(field.label, innerLeft, currentY);
      doc.font('Helvetica').text(`: ${field.value}`, innerLeft + labelW, currentY);
      currentY += 18;
    });

    currentY += 15;

    // Paragraph 1
    const p1Text = `This is to confirm that the undersigned surveyor was in attendance at the request of ${cert.client}, in their capacity as Managers, and Operators of the vessel ${vesselName}. The surveyor attended along with a representative of the company during the above-mentioned dates, while the vessel was docked at ${cert.surveyLocation}.`;
    
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(p1Text, innerLeft, currentY, { align: 'justify', lineGap: 3 });
    currentY += doc.heightOfString(p1Text, { width: pageWidth, lineGap: 3 }) + 10;

    // Paragraph 2
    const p2Text = `The purpose of the attendance was to inspect and report on the condition of the vessel's underwater hull, hull coating, propeller, rudder, and associated hull appendages.`;
    doc.text(p2Text, innerLeft, currentY, { align: 'justify', lineGap: 3 });
    currentY += doc.heightOfString(p2Text, { width: pageWidth, lineGap: 3 }) + 25;

    // SURVEY FINDINGS SUMMARY
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('SURVEY FINDINGS SUMMARY', innerLeft, currentY);
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

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Paint Details of Under Water:', innerLeft, currentY, { underline: true });
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

      const cTableTop = currentY;
      // headers
      doc.rect(innerLeft + 120, currentY, 100, 20).fill('#e5e7eb');
      doc.rect(innerLeft + 220, currentY, 100, 20).fill('#e5e7eb');
      doc.fillColor('#111827');
      
      doc.text(headers[0], innerLeft + 120, currentY + 5, { width: 100, align: 'center' });
      doc.text(headers[1], innerLeft + 220, currentY + 5, { width: 100, align: 'center' });
      
      currentY += 20;
      doc.text(row1, innerLeft + 5, currentY + 5);
      doc.text(val11 || '-', innerLeft + 120, currentY + 5, { width: 100, align: 'center' });
      doc.text(val12 || '-', innerLeft + 220, currentY + 5, { width: 100, align: 'center' });
      
      currentY += 20;
      if (row2) {
        doc.text(row2, innerLeft + 5, currentY + 5);
        doc.text(val21 || '-', innerLeft + 120, currentY + 5, { width: 100, align: 'center' });
        doc.text(val22 || '-', innerLeft + 220, currentY + 5, { width: 100, align: 'center' });
        currentY += 20;
      }
      
      const cTableBottom = currentY;
      
      // Lines
      doc.lineWidth(1).strokeColor('#d1d5db');
      // Horiz
      doc.moveTo(innerLeft + 120, cTableTop).lineTo(innerLeft + 320, cTableTop).stroke();
      doc.moveTo(innerLeft, cTableTop + 20).lineTo(innerLeft + 320, cTableTop + 20).stroke();
      doc.moveTo(innerLeft, cTableTop + 40).lineTo(innerLeft + 320, cTableTop + 40).stroke();
      if (row2) {
        doc.moveTo(innerLeft, cTableTop + 60).lineTo(innerLeft + 320, cTableTop + 60).stroke();
      }
      
      // Vert
      doc.moveTo(innerLeft, cTableTop + 20).lineTo(innerLeft, cTableBottom).stroke();
      doc.moveTo(innerLeft + 120, cTableTop).lineTo(innerLeft + 120, cTableBottom).stroke();
      doc.moveTo(innerLeft + 220, cTableTop).lineTo(innerLeft + 220, cTableBottom).stroke();
      doc.moveTo(innerLeft + 320, cTableTop).lineTo(innerLeft + 320, cTableBottom).stroke();
      
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

    // SIGNED details
    doc.font('Helvetica-Bold').fontSize(10).text('SIGNED:', innerLeft, currentY);

    // Date of issue on the right side
    const issueDateStr = `Date of issue: ${formatDate(cert.dateOfIssue)}`;
    doc.font('Helvetica-Bold').text(issueDateStr, doc.page.width - PAGE_MARGIN - 180, currentY, { align: 'right', width: 180 });

    currentY += 50;

    // Signature Line
    doc.font('Helvetica').fillColor('#4b5563').text('....................................................................', innerLeft, currentY);
    currentY += 15;

    const surveyorName = cert.issuedBy && typeof cert.issuedBy === 'object'
      ? (cert.issuedBy.username || 'Marine Surveyor')
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

      // Page Footer Contact details
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#111827')
        .text('PHONE: +94 76 68 68 718\nWEB: www.uqms.net\nE-Mail: info@uqms.net', PAGE_MARGIN, doc.page.height - PAGE_MARGIN - 30);

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
