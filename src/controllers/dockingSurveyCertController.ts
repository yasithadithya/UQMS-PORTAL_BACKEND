import { Request, Response } from 'express';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import DockingSurveyCertModel from '../models/DockingSurveyCert';
import VesselModel from '../models/Vessel';
import FirstEntrySurveyReportModel from '../models/FirstEntrySurveyReport';
import FirstEntrySurveyBookingModel from '../models/FirstEntrySurveyBooking';
import DocumentNumberModel from '../models/DocumentNumber';
import { getNextDocumentNumber } from '../services/documentNumberService';
import { createDockingSurveyPdfBuffer } from '../services/dockingSurveyPdfService';
import {
  PREVIEW_QR_TEXT,
  RenderedPdf,
  buildPublicApiUrl,
  deleteStoredPdf,
  getStoredPdfUrl,
  readStoredPdf,
  storePdf,
  storePdfAfterSave,
} from '../services/storedPdfService';
import { paginate } from '../utils/pagination';

const buildDockingSurveyPublicPdfPath = (id: string): string => `/api/docking-survey/public-pdf/${id}`;

/**
 * Render the final Docking Survey Certificate PDF and store it in R2.
 */
const renderAndStoreDockingSurveyPdf = async (req: Request, id: string): Promise<RenderedPdf | null> => {
  const certificate = await DockingSurveyCertModel.findById(id)
    .populate('vesselId')
    .populate('surveyBookingId')
    .populate('issuedBy');

  if (!certificate) {
    return null;
  }

  const qrBuffer = await QRCode.toBuffer(buildPublicApiUrl(req, buildDockingSurveyPublicPdfPath(id)));
  const buffer = await createDockingSurveyPdfBuffer(certificate, qrBuffer);
  const pdf = await storePdf(
    DockingSurveyCertModel,
    id,
    `docking-survey-certificates/docking-survey-${id}.pdf`,
    `docking-survey-${certificate.certificateNumber}.pdf`,
    buffer
  );

  return { buffer, pdf };
};

export const createDockingSurveyCert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      vesselId, surveyReportId, surveyBookingId,
      client, surveyLocation, dockingPeriodStart, dockingPeriodEnd,
      constructionMaterial, propellerDetails, tailShaftBearings, bracketBearing,
      thicknessMeasurementsBy, tmReportNo, tmReportDate,
      antifoulingPaintBy, coatingCondition, paintDetails, plateRenewals,
      sternTubeClearancePortPS, sternTubeClearancePortTB, sternTubeClearanceStbdPS, sternTubeClearanceStbdTB,
      aBracketClearancePortPS, aBracketClearancePortTB, aBracketClearanceStbdPS, aBracketClearanceStbdTB,
      rudderBearingPortPS, rudderBearingPortFA, rudderBearingStbdPS, rudderBearingStbdFA,
      overboardValves, anodes, dateOfIssue
    } = req.body;
    
    const userId = (req as any).user?.id;

    if (!vesselId || !mongoose.isValidObjectId(vesselId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Vessel ID.' });
      return;
    }
    if (!surveyReportId || !mongoose.isValidObjectId(surveyReportId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Survey Report ID.' });
      return;
    }
    if (!surveyBookingId || !mongoose.isValidObjectId(surveyBookingId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Survey Booking ID.' });
      return;
    }

    const vessel = await VesselModel.findById(vesselId);
    if (!vessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    const existingCertificate = await DockingSurveyCertModel.findOne({ surveyReportId });
    if (existingCertificate) {
      res.status(400).json({
        success: false,
        message: 'A Docking Survey Certificate has already been generated for this Survey Report.',
      });
      return;
    }

    if (!vessel.uqmsNumber) {
      res.status(400).json({
        success: false,
        message: 'Cannot generate certificate. The vessel does not have a UQMS number assigned.',
      });
      return;
    }

    const surveyReport = await FirstEntrySurveyReportModel.findById(surveyReportId);
    if (!surveyReport) {
      res.status(404).json({ success: false, message: 'Survey Report not found.' });
      return;
    }

    if (!surveyReport.reportNo) {
      res.status(400).json({
        success: false,
        message: 'Cannot generate certificate. The Survey Report does not have a report number assigned.',
      });
      return;
    }

    const surveyBooking = await FirstEntrySurveyBookingModel.findById(surveyBookingId);
    if (!surveyBooking) {
      res.status(404).json({ success: false, message: 'Survey Booking not found.' });
      return;
    }

    // Autogenerate 'ds' number sequence
    let dsConfig = await DocumentNumberModel.findOne({ name: 'ds' });
    if (!dsConfig) {
      dsConfig = new DocumentNumberModel({
        name: 'ds',
        prefix: 'DS',
        digits: 3,
        lastNumber: 0,
      });
      await dsConfig.save();
    }

    const dsNumber = await getNextDocumentNumber('ds');

    // Certificate Number Format: [Report No] - [DS Number]
    const certificateNumber = `${surveyReport.reportNo} - ${dsNumber}`;

    const newCert = new DockingSurveyCertModel({
      certificateNumber,
      vesselId,
      surveyReportId,
      surveyBookingId,
      client, surveyLocation, dockingPeriodStart, dockingPeriodEnd,
      constructionMaterial, propellerDetails, tailShaftBearings, bracketBearing,
      thicknessMeasurementsBy, tmReportNo, tmReportDate,
      antifoulingPaintBy, coatingCondition, paintDetails, plateRenewals,
      sternTubeClearancePortPS, sternTubeClearancePortTB, sternTubeClearanceStbdPS, sternTubeClearanceStbdTB,
      aBracketClearancePortPS, aBracketClearancePortTB, aBracketClearanceStbdPS, aBracketClearanceStbdTB,
      rudderBearingPortPS, rudderBearingPortFA, rudderBearingStbdPS, rudderBearingStbdFA,
      overboardValves, anodes,
      dateOfIssue: dateOfIssue || new Date(),
      issuedBy: userId,
      createdBy: userId,
      updatedBy: userId,
    });

    await newCert.save();

    const certificateId = String(newCert._id);
    await storePdfAfterSave('Docking Survey Certificate', () => renderAndStoreDockingSurveyPdf(req, certificateId));

    const populatedCert = await DockingSurveyCertModel.findById(newCert._id)
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Docking Survey Certificate created successfully.',
      data: populatedCert,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error creating Docking Survey Certificate.',
      error: error.message,
    });
  }
};

export const getDockingSurveyCertById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    const certificate = await DockingSurveyCertModel.findById(id)
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!certificate) {
      res.status(404).json({ success: false, message: 'Docking Survey Certificate not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving Docking Survey Certificate.',
      error: error.message,
    });
  }
};

export const updateDockingSurveyCert = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    const updateData = { ...req.body };
    if (userId) {
      updateData.updatedBy = userId;
    }

    delete updateData.certificateNumber;
    delete updateData.pdf;

    const savedCertificate = await DockingSurveyCertModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!savedCertificate) {
      res.status(404).json({ success: false, message: 'Docking Survey Certificate not found.' });
      return;
    }

    await storePdfAfterSave('Docking Survey Certificate', () => renderAndStoreDockingSurveyPdf(req, id));

    const updatedCertificate = await DockingSurveyCertModel.findById(id)
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'Docking Survey Certificate updated successfully.',
      data: updatedCertificate,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating Docking Survey Certificate.',
      error: error.message,
    });
  }
};

export const deleteDockingSurveyCert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    const certificate = await DockingSurveyCertModel.findByIdAndDelete(id);
    if (!certificate) {
      res.status(404).json({ success: false, message: 'Docking Survey Certificate not found.' });
      return;
    }

    await deleteStoredPdf(certificate.pdf);

    res.status(200).json({
      success: true,
      message: 'Docking Survey Certificate deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting Docking Survey Certificate.',
      error: error.message,
    });
  }
};

export const getDockingSurveyPreviewPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vesselId, surveyBookingId, surveyReportId } = req.body;

    if (!vesselId || !mongoose.isValidObjectId(vesselId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Vessel ID.' });
      return;
    }
    if (!surveyBookingId || !mongoose.isValidObjectId(surveyBookingId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Survey Booking ID.' });
      return;
    }

    const vessel = await VesselModel.findById(vesselId);
    if (!vessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    const booking = await FirstEntrySurveyBookingModel.findById(surveyBookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Survey Booking not found.' });
      return;
    }

    const surveyReport = surveyReportId && mongoose.isValidObjectId(surveyReportId)
      ? await FirstEntrySurveyReportModel.findById(surveyReportId)
      : null;

    const reportNo = surveyReport?.reportNo || 'REPORT-PENDING';
    const mockCertificateNumber = `${reportNo} - DS-PREVIEW`;

    const previewData = {
      ...req.body,
      certificateNumber: mockCertificateNumber,
      vesselId: vessel,
      surveyBookingId: booking,
      dateOfIssue: req.body.dateOfIssue || new Date(),
      issuedBy: (req as any).user,
    };

    // QR Code points to the issued certificate when one exists; a new draft has nothing to link to yet
    const existingCertificate = surveyReport
      ? await DockingSurveyCertModel.findOne({ surveyReportId }).select('_id')
      : null;
    const qrContent = existingCertificate
      ? buildPublicApiUrl(req, buildDockingSurveyPublicPdfPath(String(existingCertificate._id)))
      : PREVIEW_QR_TEXT;
    const qrBuffer = await QRCode.toBuffer(qrContent);

    const pdfBuffer = await createDockingSurveyPdfBuffer(previewData, qrBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="docking-survey-preview.pdf"');
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error generating Docking Survey Preview PDF.',
      error: error.message,
    });
  }
};

export const getDockingSurveyFinalPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    const certificate = await DockingSurveyCertModel.findById(id).select('certificateNumber pdf');
    if (!certificate) {
      res.status(404).json({ success: false, message: 'Docking Survey Certificate not found.' });
      return;
    }

    const pdfBuffer = await readStoredPdf(certificate.pdf, () => renderAndStoreDockingSurveyPdf(req, id));
    if (!pdfBuffer) {
      res.status(404).json({ success: false, message: 'Docking Survey Certificate not found.' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="docking-survey-${certificate.certificateNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error generating Docking Survey Final PDF.',
      error: error.message,
    });
  }
};

/**
 * Public route opened by the certificate's QR code. Redirects to a short-lived presigned R2 URL.
 */
export const getPublicDockingSurveyPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).send('Invalid certificate ID format.');
      return;
    }

    const certificate = await DockingSurveyCertModel.findById(id).select('pdf');
    if (!certificate) {
      res.status(404).send('Docking Survey Certificate not found.');
      return;
    }

    const presignedUrl = await getStoredPdfUrl(certificate.pdf, () => renderAndStoreDockingSurveyPdf(req, id));
    if (!presignedUrl) {
      res.status(404).send('Docking Survey Certificate not found.');
      return;
    }

    res.redirect(presignedUrl);
  } catch (error: any) {
    console.error('Error retrieving public Docking Survey Certificate PDF:', error);
    res.status(500).send('Error retrieving certificate PDF.');
  }
};

export const getDockingSurveyCertBySurveyReportId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyReportId } = req.params;
    if (!mongoose.isValidObjectId(surveyReportId)) {
      res.status(400).json({ success: false, message: 'Invalid Survey Report ID format.' });
      return;
    }

    const certificate = await DockingSurveyCertModel.findOne({ surveyReportId })
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!certificate) {
      res.status(404).json({ success: false, message: 'Certificate not found for this Survey Report.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving Certificate by Survey Report ID.',
      error: error.message,
    });
  }
};
