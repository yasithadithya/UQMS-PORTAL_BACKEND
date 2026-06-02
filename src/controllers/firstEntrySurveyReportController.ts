import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FirstEntrySurveyReportModel, { IFirstEntrySurveyReport } from '../models/FirstEntrySurveyReport';
import FirstEntrySurveyBookingModel from '../models/FirstEntrySurveyBooking';
import RequestModel from '../models/Request';

// Helper function to extract and pre-populate report details from a booking
const getPrePopulatedData = async (bookingId: string): Promise<any> => {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new Error('Invalid booking ID format.');
  }

  // 1. Fetch First Entry Survey Booking with related requests
  const booking = await FirstEntrySurveyBookingModel.findById(bookingId).populate('requestIds');
  if (!booking) {
    throw new Error('First Entry Survey Booking not found.');
  }

  // 2. Derive 1st visit date and last visit date
  let firstSurveyDate: Date | undefined;
  let lastSurveyDate: Date | undefined;

  if (booking.visitDetails && booking.visitDetails.length > 0) {
    // Sort visits chronologically by date
    const sortedVisits = [...booking.visitDetails].sort(
      (a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime()
    );

    if (sortedVisits[0]?.visitDate) {
      firstSurveyDate = new Date(sortedVisits[0].visitDate);
    }
    if (sortedVisits[sortedVisits.length - 1]?.visitDate) {
      lastSurveyDate = new Date(sortedVisits[sortedVisits.length - 1].visitDate);
    }
  }

  // Fallback for last visit date if no visits are in the list but booking has a last visit date
  if (!lastSurveyDate && (booking.lastVisitDate || booking.lastVisit)) {
    lastSurveyDate = booking.lastVisitDate ? new Date(booking.lastVisitDate) : new Date(booking.lastVisit!);
  }

  // 3. Derive survey requested date from the mapped Request
  let surveyRequestedDate: Date | undefined;
  if (booking.requestIds && booking.requestIds.length > 0) {
    const firstRequest = booking.requestIds[0] as any;
    if (firstRequest && firstRequest.createdAt) {
      surveyRequestedDate = new Date(firstRequest.createdAt);
    }
  }

  // Fallback for requested date from booking's requestedDate
  if (!surveyRequestedDate && booking.requestedDate) {
    surveyRequestedDate = new Date(booking.requestedDate);
  }

  // 4. Formulate the surveys categories array from surveysRequested in the booking
  const surveys = (booking.surveysRequested || []).map((categoryName) => ({
    surveyCategory: categoryName,
    surveyStatus: 'Pending',
    isPostponed: false,
    remarks: '',
  }));

  // 5. Construct the pre-populated structure
  return {
    bookingId: booking._id,
    vesselId: booking.vesselId,
    shipName: booking.shipName,
    managedBy: booking.managedBy,
    uqmsNo: booking.uqmsNo,
    surveyRequestedDate,
    firstSurveyDate,
    reportNo: booking.reportNo,
    portOfSurvey: booking.portOfSurvey,
    lastSurveyDate,
    surveys,
  };
};

// ==========================================
// CONTROLLERS
// ==========================================

/**
 * Get pre-populated report data from a booking ID without saving
 */
export const getPrePopulatedReportDataByBookingId = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = req.params.bookingId as string;
    if (!bookingId) {
      res.status(400).json({ success: false, message: 'Booking ID is required.' });
      return;
    }

    const prePopulatedData = await getPrePopulatedData(bookingId);

    res.status(200).json({
      success: true,
      message: 'Pre-populated report data retrieved successfully.',
      data: prePopulatedData,
    });
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      message: 'Error pre-populating report data.',
      error: error.message,
    });
  }
};

/**
 * Create a new First Entry Survey Report
 */
export const createFirstEntrySurveyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.body;
    const userId = (req as any).user?.id;

    if (!bookingId) {
      res.status(400).json({ success: false, message: 'Booking ID is required.' });
      return;
    }

    // Get pre-populated fields from booking and requests
    const prePopulatedData = await getPrePopulatedData(bookingId);

    // Merge pre-populated fields with client fields from req.body
    const reportData = {
      ...prePopulatedData,
      ...req.body,
      createdBy: userId,
      updatedBy: userId,
    };

    // If client supplied specific surveys grids, keep client's custom survey details
    // but ensure any categories from the booking are included
    if (req.body.surveys && Array.isArray(req.body.surveys)) {
      reportData.surveys = req.body.surveys;
    }

    const newReport = new FirstEntrySurveyReportModel(reportData);
    await newReport.save();

    const populatedReport = await FirstEntrySurveyReportModel.findById(newReport._id)
      .populate('bookingId')
      .populate('vesselId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'First Entry Survey Report created successfully.',
      data: populatedReport,
    });
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: 'Error creating First Entry Survey Report.',
      error: error.message,
    });
  }
};

/**
 * Get all First Entry Survey Reports
 */
export const getAllFirstEntrySurveyReports = async (_req: Request, res: Response): Promise<void> => {
  try {
    const reports = await FirstEntrySurveyReportModel.find()
      .populate('bookingId')
      .populate('vesselId')
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
      message: 'Error fetching First Entry Survey Reports.',
      error: error.message,
    });
  }
};

/**
 * Get a single First Entry Survey Report by ID
 */
export const getFirstEntrySurveyReportById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid report ID format.' });
      return;
    }

    const report = await FirstEntrySurveyReportModel.findById(id)
      .populate('bookingId')
      .populate('vesselId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!report) {
      res.status(404).json({ success: false, message: 'First Entry Survey Report not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching First Entry Survey Report.',
      error: error.message,
    });
  }
};

/**
 * Update an existing First Entry Survey Report
 */
export const updateFirstEntrySurveyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid report ID format.' });
      return;
    }

    const updateData = { ...req.body };
    if (userId) {
      updateData.updatedBy = userId;
    }

    // Find and update the report
    const updatedReport = await FirstEntrySurveyReportModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('bookingId')
      .populate('vesselId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!updatedReport) {
      res.status(404).json({ success: false, message: 'First Entry Survey Report not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'First Entry Survey Report updated successfully.',
      data: updatedReport,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating First Entry Survey Report.',
      error: error.message,
    });
  }
};

/**
 * Delete a First Entry Survey Report
 */
export const deleteFirstEntrySurveyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid report ID format.' });
      return;
    }

    const report = await FirstEntrySurveyReportModel.findByIdAndDelete(id);
    if (!report) {
      res.status(404).json({ success: false, message: 'First Entry Survey Report not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'First Entry Survey Report deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting First Entry Survey Report.',
      error: error.message,
    });
  }
};
