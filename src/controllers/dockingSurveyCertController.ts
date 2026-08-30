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
import { paginate } from '../utils/pagination';

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
    const certificateNumber = `${vessel.uqmsNumber} - ${dsNumber}`;

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
    const { id } = req.params;
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

    const updatedCertificate = await DockingSurveyCertModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('vesselId')
      .populate('surveyReportId')
      .populate('surveyBookingId')
      .populate('issuedBy', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!updatedCertificate) {
      res.status(404).json({ success: false, message: 'Docking Survey Certificate not found.' });
      return;
    }

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
    const { vesselId, surveyBookingId } = req.body;

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

    const uqmsNumber = vessel.uqmsNumber || 'UQMS-PENDING';
    const mockCertificateNumber = `${uqmsNumber} - DS-PREVIEW`;

    const previewData = {
      ...req.body,
      certificateNumber: mockCertificateNumber,
      vesselId: vessel,
      surveyBookingId: booking,
      dateOfIssue: req.body.dateOfIssue || new Date(),
      issuedBy: (req as any).user,
    };

    const protocol = req.protocol;
    const host = req.get('host');
    const publicUrl = `${protocol}://${host}/api/first-entry-survey-bookings/${booking._id}`;
    const qrBuffer = await QRCode.toBuffer(publicUrl);

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
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
      return;
    }

    const certificate = await DockingSurveyCertModel.findById(id)
      .populate('vesselId')
      .populate('surveyBookingId')
      .populate('issuedBy');

    if (!certificate) {
      res.status(404).json({ success: false, message: 'Docking Survey Certificate not found.' });
      return;
    }

    const protocol = req.protocol;
    const host = req.get('host');
    const publicUrl = `${protocol}://${host}/api/docking-survey/pdf/${certificate._id}`;
    const qrBuffer = await QRCode.toBuffer(publicUrl);

    const pdfBuffer = await createDockingSurveyPdfBuffer(certificate, qrBuffer);

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
