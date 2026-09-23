import { Request, Response } from 'express';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import SCCCOSModel from '../models/SCCCOS';
import VesselModel from '../models/Vessel';
import FirstEntrySurveyReportModel from '../models/FirstEntrySurveyReport';
import FirstEntrySurveyBookingModel from '../models/FirstEntrySurveyBooking';
import DocumentNumberModel from '../models/DocumentNumber';
import SurveyReportModel from '../models/SurveyReport';
import { getNextDocumentNumber } from '../services/documentNumberService';
import { createScccosPdfBuffer } from '../services/scccosPdfService';
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
import { rejectIfSigned } from '../services/eSignatureLock';

const buildScccosPublicPdfPath = (id: string): string => `/api/scccos/public-pdf/${id}`;

/**
 * Render the final SCCCOS Certificate PDF and store it in R2.
 */
export const renderAndStoreScccosPdf = async (req: Request, id: string): Promise<RenderedPdf | null> => {
  const certificate = await SCCCOSModel.findById(id)
    .populate({
      path: 'vesselId',
      populate: [{ path: 'vesselType' }, { path: 'areaOfOperation' }]
    })
    .populate('surveyBookingId')
    .populate('issuedBy');

  if (!certificate) {
    return null;
  }

  const qrBuffer = await QRCode.toBuffer(buildPublicApiUrl(req, buildScccosPublicPdfPath(id)));
  const { buffer, signatureField } = await createScccosPdfBuffer(certificate, qrBuffer);
  const pdf = await storePdf(
    SCCCOSModel,
    id,
    `scccos-certificates/scccos-${id}.pdf`,
    `certificate-${certificate.certificateNumber}.pdf`,
    buffer,
    signatureField
  );

  return { buffer, pdf };
};

/**
 * The Survey Report PDF shows the certificate's nominated departure point, so drop its
 * stored copy when the certificate changes; it is regenerated on next download or scan.
 * A signed Survey Report keeps the copy that was signed.
 */
const invalidateLinkedSurveyReportPdf = async (surveyReportId: unknown): Promise<void> => {
  if (!surveyReportId) return;
  await SurveyReportModel.updateOne(
    { firstEntrySurveyReportId: surveyReportId, 'eSignature.signedAt': { $exists: false } },
    { $unset: { pdf: 1 } },
    { timestamps: false }
  );
};

/**
 * Create a new SCCCOS Certificate
 */
export const createSCCCOS = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vesselId, surveyReportId, surveyBookingId, surveyFindings, dateOfIssue, typeOfSurvey, nominatedDeparturePoint, surveyorName } = req.body;
    const userId = (req as any).user?.id;

    // Validate references
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

    // Verify referenced models exist
    const vessel = await VesselModel.findById(vesselId);
    if (!vessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    // Prevent duplicate certificate generation for the same Survey Report
    const existingCertificate = await SCCCOSModel.findOne({ surveyReportId });
    if (existingCertificate) {
      res.status(400).json({
        success: false,
        message: 'A certificate has already been generated for this Survey Report.',
      });
      return;
    }

    // A vessel must have a UQMS number for certificate generation
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

    // Autogenerate 'cos' number sequence
    let cosConfig = await DocumentNumberModel.findOne({ name: 'cos' });
    if (!cosConfig) {
      cosConfig = new DocumentNumberModel({
        name: 'cos',
        prefix: 'COS',
        digits: 4,
        lastNumber: 0,
      });
      await cosConfig.save();
    }

    const cosNumber = await getNextDocumentNumber('cos');

    // Certificate Number Format: [Report No] - [COS Number]
    const certificateNumber = `${surveyReport.reportNo} - ${cosNumber}`;

    // Default findings if none provided
    const defaultFindings = [
      { category: 'Hull', status: 'N/A' },
      { category: 'Machinery', status: 'N/A' },
      { category: 'Life Saving Appliances LSA', status: 'N/A' },
      { category: 'Fire Fighting Appliances FFA', status: 'N/A' },
      { category: 'Navigation Equipment', status: 'N/A' },
      { category: 'Radio Installations', status: 'N/A' },
    ];

    const findings = surveyFindings && Array.isArray(surveyFindings) && surveyFindings.length > 0
      ? surveyFindings
      : defaultFindings;

    const newSCCCOS = new SCCCOSModel({
      certificateNumber,
      vesselId,
      surveyReportId,
      surveyBookingId,
      surveyFindings: findings,
      typeOfSurvey,
      nominatedDeparturePoint,
      surveyorName,
      dateOfIssue: dateOfIssue || new Date(),
      issuedBy: userId,
      createdBy: userId,
      updatedBy: userId,
    });

    await newSCCCOS.save();

    // Update the Survey Report's status to 'COS Generated'
    await FirstEntrySurveyReportModel.findByIdAndUpdate(surveyReportId, {
      $set: { status: 'COS Generated' }
    });

    const certificateId = String(newSCCCOS._id);
    await storePdfAfterSave('SCCCOS Certificate', () => renderAndStoreScccosPdf(req, certificateId));
    await invalidateLinkedSurveyReportPdf(surveyReportId);

    const populatedSCCCOS = await SCCCOSModel.findById(newSCCCOS._id)
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'SCCCOS Certificate created successfully.',
      data: populatedSCCCOS,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error creating SCCCOS Certificate.',
      error: error.message,
    });
  }
};

/**
 * Get all SCCCOS Certificates
 */
export const getAllSCCCOS = async (req: Request, res: Response): Promise<void> => {
  try {
    const populateOptions = [
      'vesselId',
      'surveyReportId',
      'surveyBookingId',
      { path: 'issuedBy', select: 'username email' },
      { path: 'createdBy', select: 'username email' },
      { path: 'updatedBy', select: 'username email' }
    ];

    const result = await paginate(SCCCOSModel, {}, req, populateOptions, { createdAt: -1 });
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving SCCCOS Certificates.',
      error: error.message,
    });
  }
};

/**
 * Get a single SCCCOS Certificate by ID
 */
export const getSCCCOSById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    const certificate = await SCCCOSModel.findById(id)
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!certificate) {
      res.status(404).json({ success: false, message: 'SCCCOS Certificate not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving SCCCOS Certificate.',
      error: error.message,
    });
  }
};

/**
 * Update an existing SCCCOS Certificate
 */
export const updateSCCCOS = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    if (rejectIfSigned(res, await SCCCOSModel.findById(id).select('eSignature'))) return;

    const updateData = { ...req.body };
    if (userId) {
      updateData.updatedBy = userId;
    }

    // Do not allow certificateNumber or autogenerated fields to be modified manually
    delete updateData.certificateNumber;
    delete updateData.pdf;
    delete updateData.eSignature;

    const savedCertificate = await SCCCOSModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!savedCertificate) {
      res.status(404).json({ success: false, message: 'SCCCOS Certificate not found.' });
      return;
    }

    await storePdfAfterSave('SCCCOS Certificate', () => renderAndStoreScccosPdf(req, id));
    await invalidateLinkedSurveyReportPdf(savedCertificate.surveyReportId);

    const updatedCertificate = await SCCCOSModel.findById(id)
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'SCCCOS Certificate updated successfully.',
      data: updatedCertificate,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating SCCCOS Certificate.',
      error: error.message,
    });
  }
};

/**
 * Delete a SCCCOS Certificate
 */
export const deleteSCCCOS = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    if (rejectIfSigned(res, await SCCCOSModel.findById(id).select('eSignature'))) return;

    const certificate = await SCCCOSModel.findByIdAndDelete(id);
    if (!certificate) {
      res.status(404).json({ success: false, message: 'SCCCOS Certificate not found.' });
      return;
    }

    // Restore the Survey Report's status to 'Approved'
    await FirstEntrySurveyReportModel.findByIdAndUpdate(certificate.surveyReportId, {
      $set: { status: 'Approved' }
    });

    await deleteStoredPdf(certificate.pdf);
    await invalidateLinkedSurveyReportPdf(certificate.surveyReportId);

    res.status(200).json({
      success: true,
      message: 'SCCCOS Certificate deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting SCCCOS Certificate.',
      error: error.message,
    });
  }
};

/**
 * Generate preview PDF for a draft SCCCOS Certificate
 */
export const getSCCCOSPreviewPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vesselId, surveyReportId, surveyBookingId, surveyFindings, nominatedDeparturePoint, typeOfSurvey, dateOfIssue, surveyorName } = req.body;

    // Validate references
    if (!vesselId || !mongoose.isValidObjectId(vesselId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Vessel ID.' });
      return;
    }
    if (!surveyBookingId || !mongoose.isValidObjectId(surveyBookingId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Survey Booking ID.' });
      return;
    }

    const vessel = await VesselModel.findById(vesselId).populate('vesselType').populate('areaOfOperation');
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
    const mockCertificateNumber = `${reportNo} - COS-PREVIEW`;

    // Construct preview object
    const previewData = {
      certificateNumber: mockCertificateNumber,
      vesselId: vessel,
      surveyBookingId: booking,
      surveyFindings: surveyFindings || [],
      nominatedDeparturePoint: nominatedDeparturePoint || 'Following respective Ports: Colombo, Galle, Hambantota, Trincomalee',
      typeOfSurvey: typeOfSurvey || 'SSC Initial Survey',
      surveyorName,
      dateOfIssue: dateOfIssue || new Date(),
      issuedBy: (req as any).user,
    };

    // QR Code points to the issued certificate when one exists; a new draft has nothing to link to yet
    const existingCertificate = surveyReport ? await SCCCOSModel.findOne({ surveyReportId }).select('_id') : null;
    const qrContent = existingCertificate
      ? buildPublicApiUrl(req, buildScccosPublicPdfPath(String(existingCertificate._id)))
      : PREVIEW_QR_TEXT;
    const qrBuffer = await QRCode.toBuffer(qrContent);

    const { buffer: pdfBuffer } = await createScccosPdfBuffer(previewData, qrBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="scccos-preview.pdf"');
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error generating SCCCOS Preview PDF.',
      error: error.message,
    });
  }
};

/**
 * Get final saved PDF for a SCCCOS Certificate (served from R2, generated and stored if missing)
 */
export const getSCCCOSFinalPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    const certificate = await SCCCOSModel.findById(id).select('certificateNumber pdf');
    if (!certificate) {
      res.status(404).json({ success: false, message: 'SCCCOS Certificate not found.' });
      return;
    }

    const pdfBuffer = await readStoredPdf(certificate.pdf, () => renderAndStoreScccosPdf(req, id));
    if (!pdfBuffer) {
      res.status(404).json({ success: false, message: 'SCCCOS Certificate not found.' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${certificate.certificateNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error generating SCCCOS Final PDF.',
      error: error.message,
    });
  }
};

/**
 * Public route opened by the certificate's QR code. Redirects to a short-lived presigned R2 URL.
 */
export const getPublicSCCCOSPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).send('Invalid certificate ID format.');
      return;
    }

    const certificate = await SCCCOSModel.findById(id).select('pdf');
    if (!certificate) {
      res.status(404).send('SCCCOS Certificate not found.');
      return;
    }

    const presignedUrl = await getStoredPdfUrl(certificate.pdf, () => renderAndStoreScccosPdf(req, id));
    if (!presignedUrl) {
      res.status(404).send('SCCCOS Certificate not found.');
      return;
    }

    res.redirect(presignedUrl);
  } catch (error: any) {
    console.error('Error retrieving public SCCCOS Certificate PDF:', error);
    res.status(500).send('Error retrieving certificate PDF.');
  }
};

/**
 * Get SCCCOS Certificate by Survey Report ID
 */
export const getSCCCOSBySurveyReportId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyReportId } = req.params;
    if (!mongoose.isValidObjectId(surveyReportId)) {
      res.status(400).json({ success: false, message: 'Invalid Survey Report ID format.' });
      return;
    }

    const certificate = await SCCCOSModel.findOne({ surveyReportId })
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

