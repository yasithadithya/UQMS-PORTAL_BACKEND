import { Request, Response } from 'express';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import SurveyReportModel from '../models/SurveyReport';
import FirstEntrySurveyReportModel from '../models/FirstEntrySurveyReport';
import VesselModel from '../models/Vessel';
import VesselEquipmentRecordModel from '../models/VesselEquipmentRecord';
import UserModel from '../models/User';
import DocumentNumberModel from '../models/DocumentNumber';
import SCCCOSModel from '../models/SCCCOS';
import { getNextDocumentNumber } from '../services/documentNumberService';
import { createSurveyReportPdfBuffer } from '../services/surveyReportPdfService';
import {
  RenderedPdf,
  buildPublicApiUrl,
  deleteStoredPdf,
  getStoredPdfUrl,
  readStoredPdf,
  storePdf,
  storePdfAfterSave,
} from '../services/storedPdfService';

/**
 * Render the Survey Report PDF and store it in R2.
 */
const renderAndStoreSurveyReportPdf = async (req: Request, id: string): Promise<RenderedPdf | null> => {
  // Populate vessel and nested equipment checklist questions, also vesselType and areaOfOperation
  const report = await SurveyReportModel.findById(id)
    .populate({
      path: 'vesselId',
      populate: [
        { path: 'vesselType' },
        { path: 'areaOfOperation' },
      ],
    })
    .populate({
      path: 'firstEntrySurveyReportId',
      populate: {
        path: 'bookingId',
        model: 'FirstEntrySurveyBooking',
      },
    })
    .populate({
      path: 'vesselEquipmentRecordId',
      populate: {
        path: 'equipmentRecords.questionId',
        model: 'RecEquipQues',
      },
    });

  if (!report) {
    return null;
  }

  const vessel = report.vesselId;
  const equipmentRecord = report.vesselEquipmentRecordId as any;
  const equipmentRecords = equipmentRecord ? equipmentRecord.equipmentRecords : [];

  // Find SCCCOS to get nominatedDeparturePoint if generated
  const scccos = await SCCCOSModel.findOne({ surveyReportId: report.firstEntrySurveyReportId });
  const nominatedDeparturePoint = scccos?.nominatedDeparturePoint || '';

  // QR Code points to the public PDF route
  const qrBuffer = await QRCode.toBuffer(buildPublicApiUrl(req, `/api/survey-reports/public-pdf/${id}`));

  const buffer = await createSurveyReportPdfBuffer({
    report,
    vessel,
    equipmentRecords,
    nominatedDeparturePoint,
    qrBuffer,
  });
  const pdf = await storePdf(
    SurveyReportModel,
    id,
    `survey-reports/survey-report-${id}.pdf`,
    `survey_report_${id}.pdf`,
    buffer
  );

  return { buffer, pdf };
};

// Helper function to convert full name to initials format (e.g. "S.A.P.M. SAMARASINGHE")
export const convertFullNameToInitials = (fullName: string): string => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].toUpperCase();
  const initials = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + '.').join('');
  const lastName = parts[parts.length - 1].toUpperCase();
  return `${initials} ${lastName}`;
};

/**
 * Pre-populate data for a new Survey Report based on FirstEntrySurveyReport ID
 */
export const getPrePopulatedReportData = async (req: Request, res: Response): Promise<void> => {
  try {
    const firstEntrySurveyReportId = req.params.firstEntrySurveyReportId;
    if (!mongoose.isValidObjectId(firstEntrySurveyReportId)) {
      res.status(400).json({ success: false, message: 'Invalid First Entry Survey Report ID.' });
      return;
    }

    // 1. Check if a SurveyReport already exists for this FirstEntrySurveyReport
    const existingReport = await SurveyReportModel.findOne({ firstEntrySurveyReportId });

    // 2. Fetch FirstEntrySurveyReport
    const firstEntryReport = await FirstEntrySurveyReportModel.findById(firstEntrySurveyReportId);
    if (!firstEntryReport) {
      res.status(404).json({ success: false, message: 'First Entry Survey Report not found.' });
      return;
    }

    const vesselId = firstEntryReport.vesselId;
    if (!vesselId) {
      res.status(400).json({ success: false, message: 'Vessel reference not found in First Entry Survey Report.' });
      return;
    }

    // 3. Fetch Vessel
    const vessel = await VesselModel.findById(vesselId);
    if (!vessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    // 4. Fetch VesselEquipmentRecord
    const equipmentRecord = await VesselEquipmentRecordModel.findOne({ surveyReportId: firstEntrySurveyReportId });
    if (!equipmentRecord) {
      res.status(404).json({ success: false, message: 'Vessel Equipment Record not found for this report.' });
      return;
    }

    // 5. Fetch surveyor name and initials
    const userId = (req as any).user?.id;
    let surveyorName = '';
    if (userId) {
      const user = await UserModel.findById(userId);
      if (user) {
        surveyorName = user.nameWithInitials || convertFullNameToInitials(user.fullName);
      }
    }

    // 6. Generate the pre-populated structure
    const prePopulated = {
      vesselId,
      firstEntrySurveyReportId,
      vesselEquipmentRecordId: equipmentRecord._id,
      stabilityBooklet: {
        available: false,
        approvedBy: '',
        approvalDate: null,
      },
      dockingSurvey: {
        harbour: firstEntryReport.portOfSurvey || '',
        date: firstEntryReport.lastSurveyDate || null,
      },
      thicknessMeasurement: {
        carriedBy: '',
        harbour: firstEntryReport.portOfSurvey || '',
        date: null,
        reportNo: '',
      },
      hullStructureCondition: 'satisfactory',
      hullInspections: [
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
      ],
      mainDeck: {
        coatingCondition: 'Good',
        structureCondition: 'satisfactory',
      },
      accessOpeningsCondition: 'satisfactory',
      tanks: {
        fuelOilPortName: 'P',
        fuelOilPortFrame: '',
        fuelOilPortCondition: 'satisfactory',
        fuelOilStarboardName: 'S',
        fuelOilStarboardFrame: '',
        fuelOilStarboardCondition: 'satisfactory',
        freshWaterCenterName: 'C',
        freshWaterCenterFrame: '',
        freshWaterCenterCondition: 'satisfactory',
      },
      spaces: {
        machinerySpace: 'Satisfactory',
        steeringGear: 'Satisfactory',
        operatingStation: 'Satisfactory',
        accommodation: 'Satisfactory',
      },
      toiletCount: 0,
      wheelhouse: {
        structureCondition: 'satisfactory',
        passengerSeatingCondition: 'good',
      },
      hasGalley: false,
      galleyRemarks: '',
      lifeJacketsCondition: 'satisfactory',
      pipingCondition: 'satisfactory',
      electricalExamCondition: 'as far as practicable',
      machinery: {
        mainEngineCount: vessel.noOfEngines || 2,
        mainEngineModel: vessel.mainEngineModel || 'Caterpillar',
        mainEnginePower: vessel.totalPower ? `${vessel.totalPower}kW (${Math.round(vessel.totalPower * 1.341)} HP)` : '714kW (970 HP)',
        mainEngineFuelType: 'Diesel',
        mainEngineAlarms: 'satisfaction',

        auxEngineCount: 0,
        auxEngineModel: 'Caterpillar',
        auxEngineOutput: '17KW',
        auxEngineAlarms: 'satisfaction',
        powerGeneration: vessel.electricalInstallation || '6x200Ah,12V',
      },
      signature: {
        dateOfIssue: new Date(),
        surveyorName,
        surveyorTitle: 'Marine Surveyor',
        certifyingBody: 'Universal Quality Management Systems (Pvt) Ltd.',
      },
      status: 'Draft',
    };

    res.status(200).json({
      success: true,
      message: 'Pre-populated survey report data retrieved successfully.',
      data: {
        exists: !!existingReport,
        existingReportId: existingReport ? existingReport._id : null,
        report: existingReport || prePopulated,
        vessel,
        equipmentRecordId: equipmentRecord._id,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error pre-populating survey report.',
      error: error.message,
    });
  }
};

/**
 * Create a new Survey Report
 */
export const createSurveyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const reportData = { ...req.body };
    delete reportData.pdf;

    if (userId) {
      reportData.createdBy = userId;
      reportData.updatedBy = userId;

      // Handle initials logic if surveyorName is not set
      if (!reportData.signature?.surveyorName) {
        const user = await UserModel.findById(userId);
        if (user) {
          const surveyorName = user.nameWithInitials || convertFullNameToInitials(user.fullName);
          if (!reportData.signature) reportData.signature = {};
          reportData.signature.surveyorName = surveyorName;
        }
      }
    }

    // Auto-generate certificate number if approved
    if (reportData.status === 'Approved' && !reportData.certificateNumber && reportData.firstEntrySurveyReportId) {
      const firstEntryReport = await FirstEntrySurveyReportModel.findById(reportData.firstEntrySurveyReportId);
      if (firstEntryReport && firstEntryReport.reportNo) {
        let srConfig = await DocumentNumberModel.findOne({ name: 'SR' });
        if (!srConfig) {
          srConfig = new DocumentNumberModel({
            name: 'SR',
            prefix: 'SR',
            digits: 4,
            lastNumber: 0,
          });
          await srConfig.save();
        }
        const srNumber = await getNextDocumentNumber('SR');
        // Certificate Number Format: [Report No] - [SR Number]
        reportData.certificateNumber = `${firstEntryReport.reportNo} - ${srNumber}`;
      }
    }

    const newReport = new SurveyReportModel(reportData);
    await newReport.save();

    const reportId = String(newReport._id);
    await storePdfAfterSave('Survey Report', () => renderAndStoreSurveyReportPdf(req, reportId));

    res.status(201).json({
      success: true,
      message: 'Survey Report created successfully.',
      data: await SurveyReportModel.findById(reportId),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error creating Survey Report.',
      error: error.message,
    });
  }
};

/**
 * Get all Survey Reports
 */
export const getAllSurveyReports = async (_req: Request, res: Response): Promise<void> => {
  try {
    const reports = await SurveyReportModel.find()
      .populate('vesselId')
      .populate('firstEntrySurveyReportId')
      .populate('vesselEquipmentRecordId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching Survey Reports.',
      error: error.message,
    });
  }
};

/**
 * Get Survey Report by ID
 */
export const getSurveyReportById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Survey Report ID format.' });
      return;
    }

    const report = await SurveyReportModel.findById(id)
      .populate('vesselId')
      .populate('firstEntrySurveyReportId')
      .populate('vesselEquipmentRecordId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!report) {
      res.status(404).json({ success: false, message: 'Survey Report not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching Survey Report.',
      error: error.message,
    });
  }
};

/**
 * Update Survey Report
 */
export const updateSurveyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Survey Report ID format.' });
      return;
    }

    const updateData = { ...req.body };
    delete updateData.pdf;
    if (userId) {
      updateData.updatedBy = userId;

      // Handle initials logic if surveyorName is not set, or if finalizing report (Approved)
      if (updateData.status === 'Approved' || !updateData.signature?.surveyorName) {
        const user = await UserModel.findById(userId);
        if (user) {
          const surveyorName = user.nameWithInitials || convertFullNameToInitials(user.fullName);
          if (!updateData.signature) updateData.signature = {};
          updateData.signature.surveyorName = surveyorName;
        }
      }
    }

    // Auto-generate certificate number if approved
    if (updateData.status === 'Approved' && !updateData.certificateNumber) {
      const report = await SurveyReportModel.findById(id);
      if (report && !report.certificateNumber && report.firstEntrySurveyReportId) {
        const firstEntryReport = await FirstEntrySurveyReportModel.findById(report.firstEntrySurveyReportId);
        if (firstEntryReport && firstEntryReport.reportNo) {
          let srConfig = await DocumentNumberModel.findOne({ name: 'SR' });
          if (!srConfig) {
            srConfig = new DocumentNumberModel({
              name: 'SR',
              prefix: 'SR',
              digits: 4,
              lastNumber: 0,
            });
            await srConfig.save();
          }
          const srNumber = await getNextDocumentNumber('SR');
          // Certificate Number Format: [Report No] - [SR Number]
          updateData.certificateNumber = `${firstEntryReport.reportNo} - ${srNumber}`;
        }
      }
    }

    const savedReport = await SurveyReportModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!savedReport) {
      res.status(404).json({ success: false, message: 'Survey Report not found.' });
      return;
    }

    await storePdfAfterSave('Survey Report', () => renderAndStoreSurveyReportPdf(req, id));
    const updatedReport = await SurveyReportModel.findById(id);

    res.status(200).json({
      success: true,
      message: 'Survey Report updated successfully.',
      data: updatedReport,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating Survey Report.',
      error: error.message,
    });
  }
};

/**
 * Delete Survey Report
 */
export const deleteSurveyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Survey Report ID format.' });
      return;
    }

    const report = await SurveyReportModel.findByIdAndDelete(id);
    if (!report) {
      res.status(404).json({ success: false, message: 'Survey Report not found.' });
      return;
    }

    await deleteStoredPdf(report.pdf);

    res.status(200).json({
      success: true,
      message: 'Survey Report deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting Survey Report.',
      error: error.message,
    });
  }
};

/**
 * Stream the stored Survey Report PDF from R2, generating and storing it if missing
 */
export const generateSurveyReportPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Survey Report ID format.' });
      return;
    }

    const report = await SurveyReportModel.findById(id).select('pdf');
    if (!report) {
      res.status(404).json({ success: false, message: 'Survey Report not found.' });
      return;
    }

    const pdfBuffer = await readStoredPdf(report.pdf, () => renderAndStoreSurveyReportPdf(req, id));
    if (!pdfBuffer) {
      res.status(404).json({ success: false, message: 'Survey Report not found.' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=survey_report_${id}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error generating PDF.',
      error: error.message,
    });
  }
};

/**
 * Public route opened by the report's QR code. Redirects to a short-lived presigned R2 URL.
 */
export const getPublicSurveyReportPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).send('Invalid Survey Report ID format.');
      return;
    }

    const report = await SurveyReportModel.findById(id).select('pdf');
    if (!report) {
      res.status(404).send('Survey Report not found.');
      return;
    }

    const presignedUrl = await getStoredPdfUrl(report.pdf, () => renderAndStoreSurveyReportPdf(req, id));
    if (!presignedUrl) {
      res.status(404).send('Survey Report not found.');
      return;
    }

    res.redirect(presignedUrl);
  } catch (error: any) {
    console.error('Error retrieving public Survey Report PDF:', error);
    res.status(500).send('Error retrieving Survey Report PDF.');
  }
};
