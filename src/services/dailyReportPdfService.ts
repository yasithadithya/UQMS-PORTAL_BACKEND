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
      toText(record._id, fallback)
    );
  }
  return fallback;
};

const formatDate = (value?: Date | string): string => {
  if (!value) return '-';
  const dateObj = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(dateObj.getTime())) return '-';
  // Use en-GB locale to guarantee dd/mm/yyyy formatting standard
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dateObj);
};

const drawTableRow = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  widths: number[],
  values: string[],
  height: number
): number => {
  let currentX = x;
  widths.forEach((width, index) => {
    doc.rect(currentX, y, width, height).stroke();
    doc
      .font('Helvetica')
      .fontSize(9)
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

export const createDailyReportPdfBuffer = async (
  report: any,
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
    const pageContentBottom = doc.page.height - PAGE_MARGIN - PAGE_BOTTOM_SAFE;

    // Logo image loading
    let logoPath = path.join(__dirname, '../public/logo.png');
    if (!require('fs').existsSync(logoPath)) {
      logoPath = path.join(__dirname, '../../src/public/logo.png');
    }

    const drawHeaderAndQR = (pageIndex: number) => {
      // 1. Draw Logo
      try {
        if (require('fs').existsSync(logoPath)) {
          doc.image(logoPath, PAGE_MARGIN, PAGE_MARGIN - 5, { width: 50 });
        }
      } catch (err) {
        console.warn('Could not load logo image:', err);
      }

      // 2. Draw Company details (safe bounding box to avoid QR/logo overlap)
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
        .text('No: 08, Chandralekha Mawatha, Colombo 08, Sri Lanka.', {
          width: doc.page.width - PAGE_MARGIN * 2 - 130,
          align: 'center',
        });

      // 3. Draw QR Code
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
        .strokeColor('#d1d5db')
        .lineWidth(0.75)
        .stroke()
        .strokeColor('#000000')
        .lineWidth(1);

      // Return Y coordinate after header
      return ruleY + 15;
    };

    // Initialize Page 1 Header
    let currentY = drawHeaderAndQR(0);

    // Title
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text('DAILY VISIT REPORT', innerLeft, currentY, { align: 'center' });
    
    currentY += 20;

    // Extract Booking details
    const booking = report.bookingId || {};
    const vessel = report.vesselId || {};
    const surveyReport = report.firstEntrySurveyReportId || {};

    const shipName = toText(booking.shipName || report.shipName || vessel.vesselName);
    const uqmsNumber = toText(report.uqmsNo || booking.uqmsNo || vessel.uqmsNumber);
    const dateOfBuild = formatDate(booking.buildDate || vessel.dateOfBuild);
    const vesselType = toText(booking.shipType || vessel.vesselType);
    const reportNumber = toText(booking.reportNo || surveyReport.reportNo);
    const portOfRegistry = toText(booking.portOfRegistry || vessel.portOfRegistry);
    const portOfSurvey = toText(booking.portOfSurvey || surveyReport.portOfSurvey);
    const grossTonnage = toText(booking.gt || vessel.grossTonnage);

    // Metadata Table
    const col1 = 110;
    const col2 = 160;
    const col3 = 90;
    const col4 = pageWidth - col1 - col2 - col3;

    currentY = drawTableRow(doc, innerLeft, currentY, [col1, col2, col3, col4],
      ['Ship Name', shipName, 'UQMS No.', uqmsNumber], 22);
    currentY = drawTableRow(doc, innerLeft, currentY, [col1, col2, col3, col4],
      ['Date of Build', dateOfBuild, 'Vessel Type', vesselType], 22);
    currentY = drawTableRow(doc, innerLeft, currentY, [col1, col2, col3, col4],
      ['Report Number', reportNumber, 'Gross Tonnage (GT)', grossTonnage], 22);
    currentY = drawTableRow(doc, innerLeft, currentY, [col1, col2, col3, col4],
      ['Port of Registry', portOfRegistry, 'Port of Survey', portOfSurvey], 22);

    currentY += 15;

    // Section Checklist header
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111827')
      .text('CHECKLIST DETAILS:', innerLeft, currentY);
    
    currentY += 15;

    // Group checklist items by category
    const checklist = report.checklist || [];
    const grouped: Record<string, any[]> = {};
    checklist.forEach((item: any) => {
      const q = item.checklistQuestionId || {};
      const cat = q.qCategory || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });

    const colWidths = [30, 260, 80, 145]; // Total 515 matching pageWidth

    const drawTableHeaders = (y: number) => {
      doc.rect(innerLeft, y, colWidths[0], 20).stroke();
      doc.rect(innerLeft + colWidths[0], y, colWidths[1], 20).stroke();
      doc.rect(innerLeft + colWidths[0] + colWidths[1], y, colWidths[2], 20).stroke();
      doc.rect(innerLeft + colWidths[0] + colWidths[1] + colWidths[2], y, colWidths[3], 20).stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#000000');
      
      doc.text('No.', innerLeft + 4, y + 5, { width: colWidths[0] - 8, align: 'center' });
      doc.text('Question / Item', innerLeft + colWidths[0] + 5, y + 5, { width: colWidths[1] - 10 });
      doc.text('Checked?', innerLeft + colWidths[0] + colWidths[1] + 5, y + 5, { width: colWidths[2] - 10, align: 'center' });
      doc.text('Remarks & Attachments', innerLeft + colWidths[0] + colWidths[1] + colWidths[2] + 5, y + 5, { width: colWidths[3] - 10 });

      return y + 20;
    };

    // Draw checklist table category by category
    const categories = Object.keys(grouped);
    for (const cat of categories) {
      // Draw category title. If it exceeds bottom page boundary, add new page.
      if (currentY + 45 > pageContentBottom) {
        doc.addPage();
        currentY = drawHeaderAndQR(doc.bufferedPageRange().count - 1);
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1f4e79')
        .text(cat.toUpperCase(), innerLeft, currentY);
      
      currentY += 12;
      currentY = drawTableHeaders(currentY);

      const items = grouped[cat];
      items.forEach((item, idx) => {
        const questionText = toText(item.checklistQuestionId?.item || item.checklistQuestionId?.question || 'Unknown Item');
        const isCheckedText = item.isChecked ? 'YES' : 'NO';
        
        const addFieldsInfo: string[] = [];
        
        // Include the description if it exists
        if (item.checklistQuestionId?.description) {
          addFieldsInfo.push(`Description: ${item.checklistQuestionId.description}`);
        }
        if (item.additionalFields && Array.isArray(item.additionalFields)) {
          item.additionalFields.forEach((af: any) => {
            addFieldsInfo.push(`${af.name}: ${af.value || ''}`);
          });
        }
        
        if (item.comment) {
          addFieldsInfo.push(`Comment: ${item.comment}`);
        }
        
        let remarks = toText(item.remarks, '');
        if (addFieldsInfo.length > 0) {
          const addFieldsStr = addFieldsInfo.join(' | ');
          remarks = remarks ? `${remarks}\n(${addFieldsStr})` : `(${addFieldsStr})`;
        }
        
        const files = item.files || [];

        // Determine text heights to compute required row height
        doc.font('Helvetica').fontSize(9);
        const qHeight = doc.heightOfString(questionText, { width: colWidths[1] - 10 }) + 10;
        
        let remarksHeight = doc.heightOfString(remarks || '-', { width: colWidths[3] - 10 }) + 10;
        if (files.length > 0) {
          remarksHeight += files.length * 14;
        }

        const rowHeight = Math.max(30, qHeight, remarksHeight);

        // Check page overflow
        if (currentY + rowHeight > pageContentBottom) {
          doc.addPage();
          currentY = drawHeaderAndQR(doc.bufferedPageRange().count - 1);
          currentY = drawTableHeaders(currentY);
        }

        // Highlight unsatisfied row in red
        const isUnsatisfied = item.status === 'unsatisfied';
        if (isUnsatisfied) {
          doc
            .rect(innerLeft, currentY, pageWidth, rowHeight)
            .fillColor('#fee2e2')
            .fill();
        }

        // Draw boundaries
        doc.lineWidth(0.5).strokeColor('#d1d5db');
        let xOffset = innerLeft;
        colWidths.forEach((width) => {
          doc.rect(xOffset, currentY, width, rowHeight).stroke();
          xOffset += width;
        });
        doc.lineWidth(1).strokeColor('#000000');

        // Draw Cell 1: No.
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#4b5563')
          .text(String(idx + 1), innerLeft + 4, currentY + 6, { width: colWidths[0] - 8, align: 'center' });

        // Draw Cell 2: Question
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#1f2937')
          .text(questionText, innerLeft + colWidths[0] + 5, currentY + 6, { width: colWidths[1] - 10 });

        let statusColor = item.isChecked ? '#15803d' : '#b91c1c';

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(statusColor)
          .text(isCheckedText, innerLeft + colWidths[0] + colWidths[1] + 5, currentY + 6, {
            width: colWidths[2] - 10,
            align: 'center',
          });

        // Draw Cell 4: Remarks & Attachments
        let textY = currentY + 6;
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#1f2937')
          .text(remarks || (files.length === 0 ? '-' : ''), innerLeft + colWidths[0] + colWidths[1] + colWidths[2] + 5, textY, {
            width: colWidths[3] - 10,
          });

        if (remarks) {
          textY += doc.heightOfString(remarks, { width: colWidths[3] - 10 }) + 4;
        }

        if (files.length > 0) {
          files.forEach((file: any) => {
            const filename = toText(file.filename || 'View Attachment');
            doc
              .font('Helvetica-Bold')
              .fontSize(8.5)
              .fillColor('#1d4ed8')
              .text(`📎 ${filename}`, innerLeft + colWidths[0] + colWidths[1] + colWidths[2] + 5, textY, {
                width: colWidths[3] - 10,
                link: file.url,
                underline: true,
              });
            textY += 14;
          });
        }

        currentY += rowHeight;
      });

      currentY += 15; // gap between categories
    }

    // Add Page Numbers to Footers dynamically
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#9ca3af')
        .text(
          `Universal Quality Management Systems (PVT) Ltd • Daily Visit Report • Page ${i + 1} of ${totalPages}`,
          PAGE_MARGIN,
          doc.page.height - PAGE_MARGIN - 12,
          { width: pageWidth, align: 'center', lineBreak: false }
        );
    }

    doc.end();
  });
};
