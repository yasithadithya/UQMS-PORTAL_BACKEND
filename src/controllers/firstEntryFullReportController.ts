import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FirstEntryFullReport from '../models/FirstEntryFullReport';
import FirstEntrySurveyReport from '../models/FirstEntrySurveyReport';
import Vessel from '../models/Vessel';
import ChecklistQuestion from '../models/ChecklistQuestion';
import SurveyType from '../models/SurveyType';
import User from '../models/User';

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Helper logic to generate a FirstEntryFullReport based on a FirstEntrySurveyReport.
 * This loads checklist questions from the database matching the criteria:
 * - survey category
 * - area of operation
 * - vessel code
 * - boat type (vesselType)
 */
export const generateFullReport = async (surveyReport: any): Promise<any> => {
  const vesselId = surveyReport.vesselId;
  if (!vesselId) {
    throw new Error('Vessel ID is missing from the survey report.');
  }

  // 1. Fetch Vessel details
  const vessel = await Vessel.findById(vesselId);
  if (!vessel) {
    throw new Error('Vessel not found.');
  }

  const areaOfOperationId = vessel.areaOfOperation;
  const vesselTypeId = vessel.vesselType;
  const vesselCode = vessel.vesselCode;

  const checklistMap = new Map<string, {
    checklistQuestionId: any;
    surveyNames: Set<string>;
    surveyDate?: Date;
  }>();

  // 2. Process each survey category in the survey report
  for (const survey of surveyReport.surveys || []) {
    const surveyCategoryName = survey.surveyCategory;
    if (!surveyCategoryName) continue;

    // Find matching SurveyType object ID by code or name
    const surveyType = await SurveyType.findOne({
      $or: [
        { code: { $regex: new RegExp('^' + escapeRegExp(surveyCategoryName.trim()) + '$', 'i') } },
        { name: { $regex: new RegExp('^' + escapeRegExp(surveyCategoryName.trim()) + '$', 'i') } }
      ]
    });

    if (!surveyType) {
      console.warn(`SurveyType with code or name "${surveyCategoryName}" not found. Skipping checklist generation for this category.`);
      continue;
    }

    const surveyTypeId = surveyType._id;

    // Build query for ChecklistQuestions
    // Condition: must have this survey category, and match the optional restrictions
    const matchQuery: any = {
      surveyCategories: surveyTypeId,
      $and: [
        {
          $or: [
            { areaOfOperations: { $exists: false } },
            { areaOfOperations: { $size: 0 } },
            ...(areaOfOperationId ? [{ areaOfOperations: areaOfOperationId }] : [])
          ]
        },
        {
          $or: [
            { boatTypes: { $exists: false } },
            { boatTypes: { $size: 0 } },
            ...(vesselTypeId ? [{ boatTypes: vesselTypeId }] : [])
          ]
        },
        {
          $or: [
            { vesselCode: { $exists: false } },
            { vesselCode: null },
            { vesselCode: '' },
            ...(vesselCode ? [{ vesselCode: vesselCode }] : [])
          ]
        }
      ]
    };

    const questions = await ChecklistQuestion.find(matchQuery);

    questions.forEach((q) => {
      const qIdStr = q._id.toString();
      if (checklistMap.has(qIdStr)) {
        checklistMap.get(qIdStr)!.surveyNames.add(surveyCategoryName);
      } else {
        checklistMap.set(qIdStr, {
          checklistQuestionId: q._id,
          surveyNames: new Set([surveyCategoryName]),
          surveyDate: survey.surveyDate || surveyReport.firstSurveyDate || null
        });
      }
    });
  }

  // Convert the map to the flat checklist array
  const checklist = Array.from(checklistMap.values()).map((item) => ({
    checklistQuestionId: item.checklistQuestionId,
    status: 'N/A' as const,
    visitNumber: '',
    surveyNames: Array.from(item.surveyNames),
    surveyDate: item.surveyDate,
    updatedDate: new Date(),
    remarks: '',
    files: []
  }));

  // 3. Upsert FirstEntryFullReport
  let fullReport = await FirstEntryFullReport.findOne({ firstEntrySurveyReportId: surveyReport._id });
  if (fullReport) {
    fullReport.checklist = checklist;
    fullReport.updatedBy = surveyReport.updatedBy || surveyReport.createdBy;
  } else {
    fullReport = new FirstEntryFullReport({
      firstEntrySurveyReportId: surveyReport._id,
      bookingId: surveyReport.bookingId,
      vesselId: surveyReport.vesselId,
      uqmsNo: surveyReport.uqmsNo,
      checklist,
      createdBy: surveyReport.createdBy,
      updatedBy: surveyReport.updatedBy || surveyReport.createdBy
    });
  }

  await fullReport.save();
  return fullReport;
};

/**
 * Helper function to filter visitDetails array in bookingId to only contain visits
 * relevant/assigned to the logged-in user.
 */
const filterVisitsForUser = (report: any, userId: string): any => {
  if (!report || !userId) return report;
  const reportObj = typeof report.toObject === 'function' ? report.toObject() : report;
  if (reportObj.bookingId && typeof reportObj.bookingId === 'object' && reportObj.bookingId.visitDetails) {
    reportObj.bookingId.visitDetails = reportObj.bookingId.visitDetails.filter((visit: any) => {
      return visit.surveyorAssignments?.some((assign: any) => {
        const sId = assign.surveyorId && typeof assign.surveyorId === 'object'
          ? assign.surveyorId._id?.toString()
          : assign.surveyorId?.toString();
        return sId === userId;
      });
    });
  }
  return reportObj;
};

/**
 * Get all First Entry Full Reports
 */
export const getAllFirstEntryFullReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const reports = await FirstEntryFullReport.find()
      .populate('firstEntrySurveyReportId')
      .populate('bookingId')
      .populate('vesselId')
      .populate('checklist.checklistQuestionId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 });

    const userId = (req as any).user?.id;
    const filteredReports = reports.map((r) => filterVisitsForUser(r, userId));

    res.status(200).json({
      success: true,
      count: filteredReports.length,
      data: filteredReports
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching First Entry Full Reports.',
      error: error.message
    });
  }
};

/**
 * Get a single First Entry Full Report by ID
 */
export const getFirstEntryFullReportById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid full report ID format.' });
      return;
    }

    const report = await FirstEntryFullReport.findById(id)
      .populate('firstEntrySurveyReportId')
      .populate('bookingId')
      .populate('vesselId')
      .populate('checklist.checklistQuestionId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!report) {
      res.status(404).json({ success: false, message: 'First Entry Full Report not found.' });
      return;
    }

    const userId = (req as any).user?.id;
    const filteredReport = filterVisitsForUser(report, userId);

    res.status(200).json({
      success: true,
      data: filteredReport
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching First Entry Full Report.',
      error: error.message
    });
  }
};

/**
 * Get a First Entry Full Report by its associated FirstEntrySurveyReport ID
 */
export const getFirstEntryFullReportBySurveyReportId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyReportId } = req.params;
    if (!mongoose.isValidObjectId(surveyReportId)) {
      res.status(400).json({ success: false, message: 'Invalid survey report ID format.' });
      return;
    }

    const report = await FirstEntryFullReport.findOne({ firstEntrySurveyReportId: surveyReportId })
      .populate('firstEntrySurveyReportId')
      .populate('bookingId')
      .populate('vesselId')
      .populate('checklist.checklistQuestionId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!report) {
      res.status(404).json({ success: false, message: 'First Entry Full Report not found for this survey report.' });
      return;
    }

    const userId = (req as any).user?.id;
    const filteredReport = filterVisitsForUser(report, userId);

    res.status(200).json({
      success: true,
      data: filteredReport
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching First Entry Full Report by survey report ID.',
      error: error.message
    });
  }
};

export const updateFirstEntryFullReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid full report ID format.' });
      return;
    }

    const existingReport = await FirstEntryFullReport.findById(id);
    if (!existingReport) {
      res.status(404).json({ success: false, message: 'First Entry Full Report not found.' });
      return;
    }

    const loggedInUser = userId ? await User.findById(userId) : null;

    const updates: any = { ...req.body };
    if (userId) {
      updates.updatedBy = userId;
    }

    // Map existing checklist items by checklistQuestionId for quick comparison
    const existingMap = new Map<string, any>();
    if (existingReport.checklist) {
      existingReport.checklist.forEach((item: any) => {
        if (item.checklistQuestionId) {
          const key = typeof item.checklistQuestionId === 'object' && item.checklistQuestionId._id
            ? item.checklistQuestionId._id.toString()
            : item.checklistQuestionId.toString();
          existingMap.set(key, item);
        }
      });
    }

    // Validate checklist structure if provided
    if (updates.checklist && Array.isArray(updates.checklist)) {
      for (const item of updates.checklist) {
        // Extract ID if checklistQuestionId is sent as populated object
        const qId = item.checklistQuestionId && typeof item.checklistQuestionId === 'object' && item.checklistQuestionId._id
          ? item.checklistQuestionId._id
          : item.checklistQuestionId;

        if (!mongoose.isValidObjectId(qId)) {
          res.status(400).json({ success: false, message: `Invalid checklistQuestionId: ${qId}` });
          return;
        }

        // Map back to ID string
        item.checklistQuestionId = qId;

        if (item.status && !['satisfied', 'unsatisfied', 'N/A'].includes(item.status)) {
          res.status(400).json({ success: false, message: `Invalid status: ${item.status}. Must be 'satisfied', 'unsatisfied', or 'N/A'.` });
          return;
        }
        if (item.files && Array.isArray(item.files)) {
          for (const file of item.files) {
            if (!file.filename || !file.key) {
              res.status(400).json({ success: false, message: 'Uploaded file must have filename and key.' });
              return;
            }
          }
        }

        // Compare with existing item to see if it was modified
        const existingItem = existingMap.get(qId.toString());
        let isChanged = false;

        if (!existingItem) {
          isChanged = true;
        } else {
          const statusChanged = item.status !== existingItem.status;
          const remarksChanged = (item.remarks || '') !== (existingItem.remarks || '');
          const visitChanged = (item.visitNumber || '') !== (existingItem.visitNumber || '');
          
          const existingFiles = existingItem.files || [];
          const newFiles = item.files || [];
          const filesChanged = existingFiles.length !== newFiles.length || 
            newFiles.some((f: any, idx: number) => !existingFiles[idx] || f.key !== existingFiles[idx].key);

          if (statusChanged || remarksChanged || visitChanged || filesChanged) {
            isChanged = true;
          }
        }

        if (isChanged && loggedInUser) {
          item.surveyorName = loggedInUser.username;
          item.surveyorId = loggedInUser._id;
          item.updatedDate = new Date();
        } else if (existingItem) {
          // Keep existing values if unchanged
          item.surveyorName = existingItem.surveyorName;
          item.surveyorId = existingItem.surveyorId;
          item.updatedDate = existingItem.updatedDate;
        }
      }
    }

    const updatedReport = await FirstEntryFullReport.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('firstEntrySurveyReportId')
      .populate('bookingId')
      .populate('vesselId')
      .populate('checklist.checklistQuestionId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!updatedReport) {
      res.status(404).json({ success: false, message: 'First Entry Full Report not found.' });
      return;
    }

    const filteredReport = filterVisitsForUser(updatedReport, userId);

    res.status(200).json({
      success: true,
      message: 'First Entry Full Report updated successfully.',
      data: filteredReport
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating First Entry Full Report.',
      error: error.message
    });
  }
};

/**
 * Delete a First Entry Full Report
 */
export const deleteFirstEntryFullReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid full report ID format.' });
      return;
    }

    const report = await FirstEntryFullReport.findByIdAndDelete(id);
    if (!report) {
      res.status(404).json({ success: false, message: 'First Entry Full Report not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'First Entry Full Report deleted successfully.'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting First Entry Full Report.',
      error: error.message
    });
  }
};

/**
 * Manually trigger full report generation or regeneration for a survey report ID
 */
export const triggerFullReportGeneration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyReportId } = req.params;
    if (!mongoose.isValidObjectId(surveyReportId)) {
      res.status(400).json({ success: false, message: 'Invalid survey report ID format.' });
      return;
    }

    const surveyReport = await FirstEntrySurveyReport.findById(surveyReportId);
    if (!surveyReport) {
      res.status(404).json({ success: false, message: 'First Entry Survey Report not found.' });
      return;
    }

    const fullReport = await generateFullReport(surveyReport);

    const populatedFullReport = await FirstEntryFullReport.findById(fullReport._id)
      .populate('firstEntrySurveyReportId')
      .populate('bookingId')
      .populate('vesselId')
      .populate('checklist.checklistQuestionId')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    const userId = (req as any).user?.id;
    const filteredReport = filterVisitsForUser(populatedFullReport, userId);

    res.status(200).json({
      success: true,
      message: 'First Entry Full Report generated successfully.',
      data: filteredReport
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error generating First Entry Full Report.',
      error: error.message
    });
  }
};
