import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FirstEntrySurveyBookingModel, { IFirstEntrySurveyBooking } from '../models/FirstEntrySurveyBooking';
import VesselModel, { IVessel } from '../models/Vessel';
import VesselTypeModel from '../models/VesselType';
import DocumentNumberModel from '../models/DocumentNumber';
import { getNextDocumentNumber } from '../services/documentNumberService';

// Helper to convert booking data fields to Vessel fields
const getVesselFieldsFromBooking = async (bookingData: any) => {
  const fields: any = {};
  
  if (bookingData.shipName !== undefined) fields.vesselName = bookingData.shipName;
  if (bookingData.portOfRegistry !== undefined) fields.portOfRegistry = bookingData.portOfRegistry;
  if (bookingData.flag !== undefined) fields.flag = bookingData.flag;
  if (bookingData.shipBuilder !== undefined) fields.builder = bookingData.shipBuilder;
  if (bookingData.engineBuilder !== undefined) fields.engineBuilder = bookingData.engineBuilder;
  if (bookingData.dwt !== undefined) fields.deadweight = bookingData.dwt;
  if (bookingData.keelDate !== undefined) fields.keelDate = bookingData.keelDate;
  if (bookingData.uqmsNo !== undefined) fields.uqmsNumber = bookingData.uqmsNo;
  if (bookingData.managedBy !== undefined) fields.managerName = bookingData.managedBy;
  if (bookingData.buildDate !== undefined) fields.dateOfBuild = bookingData.buildDate;
  if (bookingData.yardNo !== undefined) fields.yardNo = bookingData.yardNo;
  if (bookingData.gt !== undefined) fields.grossTonnage = bookingData.gt;
  if (bookingData.callSign !== undefined) fields.callSign = bookingData.callSign;

  if (bookingData.shipType) {
    if (mongoose.isValidObjectId(bookingData.shipType)) {
      fields.vesselType = bookingData.shipType;
    } else {
      const vType = await VesselTypeModel.findOne({ name: { $regex: new RegExp(`^${bookingData.shipType}$`, 'i') } });
      if (vType) {
        fields.vesselType = vType._id;
      } else {
        const group = bookingData.shipType.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        const existingGroup = await VesselTypeModel.findOne({ group });
        if (!existingGroup) {
          const newVType = new VesselTypeModel({
            name: bookingData.shipType.trim(),
            group: group
          });
          await newVType.save();
          fields.vesselType = newVType._id;
        } else {
          fields.vesselType = existingGroup._id;
        }
      }
    }
  }

  return fields;
};

// Helper to update or create a Vessel in DB based on booking data
const syncVesselDetails = async (bookingData: any, userId?: string): Promise<mongoose.Types.ObjectId> => {
  let vessel: IVessel | null = null;

  // 1. Try to find the vessel by vesselId
  if (bookingData.vesselId && mongoose.isValidObjectId(bookingData.vesselId)) {
    vessel = await VesselModel.findById(bookingData.vesselId);
  }

  // 2. Try to find the vessel by uqmsNo if not found by ID
  if (!vessel && bookingData.uqmsNo) {
    vessel = await VesselModel.findOne({ uqmsNumber: bookingData.uqmsNo.trim() });
  }

  // 3. Try to find the vessel by shipName (vesselName) if still not found
  if (!vessel && bookingData.shipName) {
    vessel = await VesselModel.findOne({ vesselName: bookingData.shipName.trim() });
  }

  const vesselFields = await getVesselFieldsFromBooking(bookingData);

  if (vessel) {
    // Vessel exists, compare and update only the fields that are different or new
    let isUpdated = false;
    for (const key of Object.keys(vesselFields)) {
      const dbValue = (vessel as any)[key];
      const newValue = vesselFields[key];

      if (dbValue instanceof Date && newValue instanceof Date) {
        if (dbValue.getTime() !== newValue.getTime()) {
          (vessel as any)[key] = newValue;
          isUpdated = true;
        }
      } else if (dbValue instanceof mongoose.Types.ObjectId && newValue instanceof mongoose.Types.ObjectId) {
        if (!dbValue.equals(newValue)) {
          (vessel as any)[key] = newValue;
          isUpdated = true;
        }
      } else if (dbValue !== newValue) {
        if (newValue !== undefined) {
          (vessel as any)[key] = newValue;
          isUpdated = true;
        }
      }
    }

    if (isUpdated) {
      if (userId) {
        vessel.updatedBy = new mongoose.Types.ObjectId(userId);
      }
      await vessel.save();
    }
    return vessel._id as mongoose.Types.ObjectId;
  } else {
    // Vessel does not exist, create a new one
    if (!bookingData.shipName) {
      throw new Error('Ship Name (vesselName) is required to create a new vessel.');
    }

    const newVesselData = {
      ...vesselFields,
      vesselName: bookingData.shipName,
      status: 'active',
      createdBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      updatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
    };

    const newVessel = new VesselModel(newVesselData);
    await newVessel.save();
    return newVessel._id as mongoose.Types.ObjectId;
  }
};

// ==========================================
// CRUD CONTROLLERS
// ==========================================

export const createFirstEntrySurveyBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingData = { ...req.body };
    const userId = (req as any).user?.id;

    if (!bookingData.shipName || !bookingData.shipName.trim()) {
      res.status(400).json({ success: false, message: 'Ship name is required.' });
      return;
    }

    // MANDATORY FIELD VALIDATION
    if (!bookingData.portOfSurvey || !bookingData.portOfSurvey.trim()) {
      res.status(400).json({ success: false, message: 'Port of Survey is required.' });
      return;
    }
    if (!bookingData.shipBuilder || !bookingData.shipBuilder.trim()) {
      res.status(400).json({ success: false, message: 'Ship Builder is required.' });
      return;
    }
    if (!bookingData.engineBuilder || !bookingData.engineBuilder.trim()) {
      res.status(400).json({ success: false, message: 'Engine Builder is required.' });
      return;
    }

    // Visit Date is mandatory for all visits
    if (bookingData.visitDetails && Array.isArray(bookingData.visitDetails)) {
      for (const visit of bookingData.visitDetails) {
        if (!visit.visitDate) {
          res.status(400).json({ success: false, message: 'Visit Date is required for all visits.' });
          return;
        }
      }
    }

    // Sync vessel details with the Vessel collection
    const vesselId = await syncVesselDetails(bookingData, userId);
    bookingData.vesselId = vesselId;

    // AUTOMATIC REPORT NUMBER GENERATION (document number name is 'report')
    let reportConfig = await DocumentNumberModel.findOne({ name: 'report' });
    if (!reportConfig) {
      reportConfig = new DocumentNumberModel({
        name: 'report',
        prefix: 'REP-',
        digits: 4,
        lastNumber: 100, // REP-0101 will be the first code
      });
      await reportConfig.save();
    }
    const generatedReportNo = await getNextDocumentNumber('report');
    bookingData.reportNo = generatedReportNo;

    // Compute lastVisitDate & lastVisit from visitDetails if a row is marked as the last visit
    if (bookingData.visitDetails && Array.isArray(bookingData.visitDetails)) {
      const lastVisitRowIndex = bookingData.visitDetails.findIndex(
        (v: any) => v.isLastVisitDate === true || v.isLastVist === true
      );
      if (lastVisitRowIndex !== -1) {
        const lastVisitRow = bookingData.visitDetails[lastVisitRowIndex];
        bookingData.lastVisitDate = new Date(lastVisitRow.visitDate);
        bookingData.lastVisit = new Date(lastVisitRow.visitDate);
        
        // Ensure all rows have correct boolean values
        bookingData.visitDetails = bookingData.visitDetails.map((v: any, idx: number) => ({
          ...v,
          isLastVisitDate: idx === lastVisitRowIndex,
          isLastVist: idx === lastVisitRowIndex
        }));
      } else {
        bookingData.lastVisitDate = undefined;
        bookingData.lastVisit = undefined;
        
        // Ensure all other rows are false
        bookingData.visitDetails = bookingData.visitDetails.map((v: any) => ({
          ...v,
          isLastVisitDate: false,
          isLastVist: false
        }));
      }
    }

    const newBooking = new FirstEntrySurveyBookingModel({
      ...bookingData,
      createdBy: userId,
      updatedBy: userId,
    });

    await newBooking.save();

    const populatedBooking = await FirstEntrySurveyBookingModel.findById(newBooking._id)
      .populate('vesselId')
      .populate('visitDetails.surveyorAssignments.surveyorId', 'username email')
      .populate('requestIds')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'First Entry Survey Booking created successfully.',
      data: populatedBooking,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error creating First Entry Survey Booking.',
      error: error.message,
    });
  }
};

export const getAllFirstEntrySurveyBookings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const bookings = await FirstEntrySurveyBookingModel.find()
      .populate('vesselId')
      .populate('visitDetails.surveyorAssignments.surveyorId', 'username email')
      .populate('requestIds')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching First Entry Survey Bookings.',
      error: error.message,
    });
  }
};

export const getFirstEntrySurveyBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await FirstEntrySurveyBookingModel.findById(req.params.id)
      .populate('vesselId')
      .populate('visitDetails.surveyorAssignments.surveyorId', 'username email')
      .populate('requestIds')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!booking) {
      res.status(404).json({ success: false, message: 'First Entry Survey Booking not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching First Entry Survey Booking.',
      error: error.message,
    });
  }
};

export const updateFirstEntrySurveyBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const bookingData = { ...req.body };
    const userId = (req as any).user?.id;

    // Retrieve existing booking first
    const existingBooking = await FirstEntrySurveyBookingModel.findById(req.params.id);
    if (!existingBooking) {
      res.status(404).json({ success: false, message: 'First Entry Survey Booking not found.' });
      return;
    }

    // MANDATORY FIELD VALIDATION
    if (bookingData.portOfSurvey !== undefined && (!bookingData.portOfSurvey || !bookingData.portOfSurvey.trim())) {
      res.status(400).json({ success: false, message: 'Port of Survey is required.' });
      return;
    }
    if (bookingData.shipBuilder !== undefined && (!bookingData.shipBuilder || !bookingData.shipBuilder.trim())) {
      res.status(400).json({ success: false, message: 'Ship Builder is required.' });
      return;
    }
    if (bookingData.engineBuilder !== undefined && (!bookingData.engineBuilder || !bookingData.engineBuilder.trim())) {
      res.status(400).json({ success: false, message: 'Engine Builder is required.' });
      return;
    }

    // Visit Date is mandatory for all visits
    if (bookingData.visitDetails && Array.isArray(bookingData.visitDetails)) {
      for (const visit of bookingData.visitDetails) {
        if (!visit.visitDate) {
          res.status(400).json({ success: false, message: 'Visit Date is required for all visits.' });
          return;
        }
      }
    }

    // A USER CAN ONLY EDIT BLANK FIELDS AND VISIT SECTION ONCE SAVED
    // If a field already had a value in the DB, it CANNOT be modified.
    const nonEditableFields = [
      'vesselId', 'shipName', 'requestedBy', 'portOfSurvey', 'reportNo',
      'portOfRegistry', 'flag', 'shipType', 'shipBuilder', 'engineBuilder',
      'duallyClassWith', 'dwt', 'keelDate', 'uqmsNo', 'requestedDate',
      'surveyMode', 'society', 'managedBy', 'buildDate', 'yardNo',
      'officialNo', 'gt', 'callSign', 'surveysRequested', 'companyId', 'status', 'requestIds'
    ];

    for (const key of nonEditableFields) {
      const dbValue = (existingBooking as any)[key];
      const newValue = bookingData[key];

      const isDbValueBlank = dbValue === undefined || dbValue === null || dbValue === '' || (Array.isArray(dbValue) && dbValue.length === 0);

      if (!isDbValueBlank) {
        let isDifferent = false;
        if (dbValue instanceof Date && newValue) {
          isDifferent = new Date(dbValue).getTime() !== new Date(newValue).getTime();
        } else if (dbValue instanceof mongoose.Types.ObjectId && newValue) {
          isDifferent = !dbValue.equals(new mongoose.Types.ObjectId(newValue));
        } else if (Array.isArray(dbValue) && Array.isArray(newValue)) {
          isDifferent = dbValue.length !== newValue.length || dbValue.some((v, idx) => String(v) !== String(newValue[idx]));
        } else if (dbValue !== newValue && newValue !== undefined) {
          isDifferent = true;
        }

        // If different, restore original value from DB (user can only edit blank fields)
        if (isDifferent) {
          bookingData[key] = dbValue;
        }
      }
    }

    // Retain or auto-generate report number if somehow not generated yet
    if (!existingBooking.reportNo && !bookingData.reportNo) {
      let reportConfig = await DocumentNumberModel.findOne({ name: 'report' });
      if (!reportConfig) {
        reportConfig = new DocumentNumberModel({
          name: 'report',
          prefix: 'REP-',
          digits: 4,
          lastNumber: 100,
        });
        await reportConfig.save();
      }
      const generatedReportNo = await getNextDocumentNumber('report');
      bookingData.reportNo = generatedReportNo;
    } else {
      bookingData.reportNo = existingBooking.reportNo; // Cannot change report number once generated
    }

    // Sync vessel details with the Vessel collection using the final data
    const vesselId = await syncVesselDetails(bookingData, userId);
    bookingData.vesselId = vesselId;

    // Compute lastVisitDate & lastVisit from visitDetails if a row is marked as the last visit
    if (bookingData.visitDetails && Array.isArray(bookingData.visitDetails)) {
      const lastVisitRowIndex = bookingData.visitDetails.findIndex(
        (v: any) => v.isLastVisitDate === true || v.isLastVist === true
      );
      if (lastVisitRowIndex !== -1) {
        const lastVisitRow = bookingData.visitDetails[lastVisitRowIndex];
        bookingData.lastVisitDate = new Date(lastVisitRow.visitDate);
        bookingData.lastVisit = new Date(lastVisitRow.visitDate);
        
        // Ensure all rows have correct boolean values
        bookingData.visitDetails = bookingData.visitDetails.map((v: any, idx: number) => ({
          ...v,
          isLastVisitDate: idx === lastVisitRowIndex,
          isLastVist: idx === lastVisitRowIndex
        }));
      } else {
        bookingData.lastVisitDate = undefined;
        bookingData.lastVisit = undefined;
        
        // Ensure all other rows are false
        bookingData.visitDetails = bookingData.visitDetails.map((v: any) => ({
          ...v,
          isLastVisitDate: false,
          isLastVist: false
        }));
      }
    }

    if (userId) {
      bookingData.updatedBy = userId;
    }

    const updatedBooking = await FirstEntrySurveyBookingModel.findByIdAndUpdate(
      req.params.id,
      { $set: bookingData },
      { new: true, runValidators: true }
    )
      .populate('vesselId')
      .populate('visitDetails.surveyorAssignments.surveyorId', 'username email')
      .populate('requestIds')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'First Entry Survey Booking updated successfully.',
      data: updatedBooking,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating First Entry Survey Booking.',
      error: error.message,
    });
  }
};

export const deleteFirstEntrySurveyBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await FirstEntrySurveyBookingModel.findByIdAndDelete(req.params.id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'First Entry Survey Booking not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'First Entry Survey Booking deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting First Entry Survey Booking.',
      error: error.message,
    });
  }
};
