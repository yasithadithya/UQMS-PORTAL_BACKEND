import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FirstEntryModel from '../models/FirstEntry';
import ScheduleIIModel from '../models/ScheduleII';
import RequestModel from '../models/Request';
import VesselModel from '../models/Vessel';
import { getNextDocumentNumber } from '../services/documentNumberService';
import nodemailer from 'nodemailer';

// ==========================================
// FIRST ENTRY CONTROLLERS
// ==========================================

export const createFirstEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { request, vessel, isQuoted, quotationNumber, quotationComments } = req.body;

    if (!mongoose.isValidObjectId(request)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }
    if (!mongoose.isValidObjectId(vessel)) {
      res.status(400).json({ success: false, message: 'Invalid vessel ID format.' });
      return;
    }

    const requestExists = await RequestModel.findById(request);
    if (!requestExists) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    const vesselExists = await VesselModel.findById(vessel);
    if (!vesselExists) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    const newFirstEntry = new FirstEntryModel({
      request,
      vessel,
      isQuoted: isQuoted || false,
      quotationNumber,
      quotationComments,
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    });

    await newFirstEntry.save();

    const populatedEntry = await FirstEntryModel.findById(newFirstEntry._id)
      .populate('request')
      .populate('vessel')
      .populate('scheduleII')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'First entry created successfully.',
      data: populatedEntry,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error creating first entry.', error: error.message });
  }
};

export const getAllFirstEntries = async (_req: Request, res: Response): Promise<void> => {
  try {
    const entries = await FirstEntryModel.find()
      .populate('request')
      .populate('vessel')
      .populate('scheduleII')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching first entries.', error: error.message });
  }
};

export const getFirstEntryById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid first entry ID format.' });
      return;
    }

    const entry = await FirstEntryModel.findById(req.params.id)
      .populate('request')
      .populate('vessel')
      .populate('scheduleII')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!entry) {
      res.status(404).json({ success: false, message: 'First entry not found.' });
      return;
    }

    res.status(200).json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching first entry.', error: error.message });
  }
};

export const updateFirstEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid first entry ID format.' });
      return;
    }

    const updateData = { ...req.body };
    if ((req as any).user?.id) {
      updateData.updatedBy = (req as any).user.id;
    }

    if (updateData.request && !mongoose.isValidObjectId(updateData.request)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }
    
    if (updateData.vessel && !mongoose.isValidObjectId(updateData.vessel)) {
      res.status(400).json({ success: false, message: 'Invalid vessel ID format.' });
      return;
    }

    const updatedEntry = await FirstEntryModel.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('request')
      .populate('vessel')
      .populate('scheduleII')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!updatedEntry) {
      res.status(404).json({ success: false, message: 'First entry not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'First entry updated successfully.',
      data: updatedEntry,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error updating first entry.', error: error.message });
  }
};

export const deleteFirstEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid first entry ID format.' });
      return;
    }

    const entry = await FirstEntryModel.findByIdAndDelete(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, message: 'First entry not found.' });
      return;
    }

    // Clean up associated ScheduleII if it exists
    if (entry.scheduleII) {
      await ScheduleIIModel.findByIdAndDelete(entry.scheduleII);
    }

    res.status(200).json({ success: true, message: 'First entry deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting first entry.', error: error.message });
  }
};

// ==========================================
// SCHEDULE II CONTROLLERS
// ==========================================

export const createScheduleII = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstEntryId, status, documents } = req.body;

    if (!mongoose.isValidObjectId(firstEntryId)) {
      res.status(400).json({ success: false, message: 'Invalid first entry ID format.' });
      return;
    }

    const firstEntryExists = await FirstEntryModel.findById(firstEntryId);
    if (!firstEntryExists) {
      res.status(404).json({ success: false, message: 'First entry not found.' });
      return;
    }

    if (firstEntryExists.scheduleII) {
      res.status(400).json({ success: false, message: 'First entry already has a Schedule II assigned.' });
      return;
    }

    const newScheduleII = new ScheduleIIModel({
      firstEntry: firstEntryId,
      status: status || 'pending',
      documents: documents || [],
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    });

    await newScheduleII.save();

    // Link scheduleII to FirstEntry
    firstEntryExists.scheduleII = newScheduleII._id as mongoose.Types.ObjectId;
    await firstEntryExists.save();

    // Generate and assign UQMS number to the vessel if not already present
    try {
      const vessel = await VesselModel.findById(firstEntryExists.vessel);
      if (vessel && !vessel.uqmsNumber) {
        const uqmsNumber = await getNextDocumentNumber('UQMS');
        vessel.uqmsNumber = uqmsNumber;
        await vessel.save();

        // Update the associated request's status to 'success'
        if (firstEntryExists.request) {
          await RequestModel.findByIdAndUpdate(firstEntryExists.request, { status: 'success' });
        }
      }
    } catch (err: any) {
      console.error('Failed to generate UQMS number on Schedule II creation:', err);
    }

    const populatedSchedule = await ScheduleIIModel.findById(newScheduleII._id)
      .populate('firstEntry')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Schedule II created successfully.',
      data: populatedSchedule,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error creating Schedule II.', error: error.message });
  }
};

export const getScheduleIIById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.scheduleId)) {
      res.status(400).json({ success: false, message: 'Invalid schedule ID format.' });
      return;
    }

    const schedule = await ScheduleIIModel.findById(req.params.scheduleId)
      .populate('firstEntry')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!schedule) {
      res.status(404).json({ success: false, message: 'Schedule II not found.' });
      return;
    }

    res.status(200).json({ success: true, data: schedule });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching Schedule II.', error: error.message });
  }
};

export const updateScheduleII = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.scheduleId)) {
      res.status(400).json({ success: false, message: 'Invalid schedule ID format.' });
      return;
    }

    const updateData = { ...req.body };
    if ((req as any).user?.id) {
      updateData.updatedBy = (req as any).user.id;
    }

    const updatedSchedule = await ScheduleIIModel.findByIdAndUpdate(
      req.params.scheduleId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('firstEntry')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!updatedSchedule) {
      res.status(404).json({ success: false, message: 'Schedule II not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Schedule II updated successfully.',
      data: updatedSchedule,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error updating Schedule II.', error: error.message });
  }
};

export const deleteScheduleII = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.scheduleId)) {
      res.status(400).json({ success: false, message: 'Invalid schedule ID format.' });
      return;
    }

    const schedule = await ScheduleIIModel.findByIdAndDelete(req.params.scheduleId);
    if (!schedule) {
      res.status(404).json({ success: false, message: 'Schedule II not found.' });
      return;
    }

    // Remove reference from FirstEntry
    await FirstEntryModel.findByIdAndUpdate(schedule.firstEntry, {
      $unset: { scheduleII: 1 }
    });

    res.status(200).json({ success: true, message: 'Schedule II deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting Schedule II.', error: error.message });
  }
};

export const sendScheduleIIEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { scheduleId } = req.params;
    if (!mongoose.isValidObjectId(scheduleId)) {
      res.status(400).json({ success: false, message: 'Invalid schedule ID format.' });
      return;
    }

    const schedule = await ScheduleIIModel.findById(scheduleId).populate({
      path: 'firstEntry',
      populate: { path: 'vessel' }
    });

    if (!schedule) {
      res.status(404).json({ success: false, message: 'Schedule II not found.' });
      return;
    }

    if (schedule.emailSent) {
      res.status(400).json({ success: false, message: 'Email has already been sent for this Schedule II.' });
      return;
    }

    const firstEntry: any = schedule.firstEntry;
    const vesselName = firstEntry?.vessel?.vesselName || 'Unknown Vessel';

    const attachments = (schedule.documents || []).map(doc => ({
      filename: doc.name,
      path: doc.url
    }));

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mail.uqms.net',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SENDER_EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: process.env.DSSC_EMAIL,
      subject: `Schedule II Documents - ${vesselName}`,
      text: `Please find the attached Schedule II documents for the vessel: ${vesselName}.`,
      attachments,
    };

    await transporter.sendMail(mailOptions);

    schedule.emailSent = true;
    await schedule.save();

    res.status(200).json({ success: true, message: 'Email sent successfully.' });
  } catch (error: any) {
    console.error('Error sending Schedule II email:', error);
    res.status(500).json({ success: false, message: 'Error sending email.', error: error.message });
  }
};
