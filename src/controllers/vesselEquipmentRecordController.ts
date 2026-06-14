import { Request, Response } from 'express';
import mongoose from 'mongoose';
import VesselEquipmentRecord from '../models/VesselEquipmentRecord';
import FirstEntrySurveyReport from '../models/FirstEntrySurveyReport';
import RecEquipQues from '../models/RecEquipQues';

// Get equipment record by Survey Report ID (or template if not exists)
export const getEquipmentRecordBySurveyReportId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyReportId } = req.params;

    if (!mongoose.isValidObjectId(surveyReportId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid Survey Report ID format.',
      });
      return;
    }

    // Attempt to find existing record
    let record = await VesselEquipmentRecord.findOne({ surveyReportId }).populate('equipmentRecords.questionId');

    if (record) {
      // Check if there are any new questions in RecEquipQues that aren't in this record yet
      const allQuestions = await RecEquipQues.find();
      const existingQuestionIds = record.equipmentRecords.map((r: any) => 
        r.questionId ? (r.questionId._id || r.questionId).toString() : ''
      );

      const missingQuestions = allQuestions.filter(q => !existingQuestionIds.includes(q._id.toString()));

      if (missingQuestions.length > 0) {
        // Merge missing questions as 'Not Provided'
        const mergedRecords = [...record.equipmentRecords];
        missingQuestions.forEach(q => {
          mergedRecords.push({
            questionId: q,
            status: 'Not Provided',
            remarks: '',
          } as any);
        });
        
        // Sort merged list by codeRefNo
        mergedRecords.sort((a: any, b: any) => {
          const codeA = a.questionId?.codeRefNo || '';
          const codeB = b.questionId?.codeRefNo || '';
          return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.status(200).json({
          success: true,
          data: {
            _id: record._id,
            vesselId: record.vesselId,
            surveyReportId: record.surveyReportId,
            equipmentRecords: mergedRecords,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          },
        });
        return;
      }

      // Sort existing record by codeRefNo
      const sortedRecords = [...record.equipmentRecords].sort((a: any, b: any) => {
        const codeA = a.questionId?.codeRefNo || '';
        const codeB = b.questionId?.codeRefNo || '';
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      });

      res.status(200).json({
        success: true,
        data: {
          _id: record._id,
          vesselId: record.vesselId,
          surveyReportId: record.surveyReportId,
          equipmentRecords: sortedRecords,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      });
      return;
    }

    // If record doesn't exist, get survey report details to template it
    const surveyReport = await FirstEntrySurveyReport.findById(surveyReportId);
    if (!surveyReport) {
      res.status(404).json({
        success: false,
        message: 'Survey Report not found.',
      });
      return;
    }

    // Get all questions to construct initial state
    const questions = await RecEquipQues.find();
    // Sort questions numerically/alphabetically by codeRefNo
    questions.sort((a, b) => a.codeRefNo.localeCompare(b.codeRefNo, undefined, { numeric: true, sensitivity: 'base' }));

    const initialRecords = questions.map((q) => ({
      questionId: q,
      status: 'Not Provided',
      remarks: '',
    }));

    res.status(200).json({
      success: true,
      data: {
        vesselId: surveyReport.vesselId,
        surveyReportId: surveyReport._id,
        equipmentRecords: initialRecords,
        isNew: true,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching equipment record.',
      error: error.message,
    });
  }
};

// Create or update equipment record
export const upsertEquipmentRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyReportId } = req.params;
    const { vesselId, equipmentRecords } = req.body;

    if (!mongoose.isValidObjectId(surveyReportId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid Survey Report ID format.',
      });
      return;
    }

    if (!mongoose.isValidObjectId(vesselId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid Vessel ID format.',
      });
      return;
    }

    if (!Array.isArray(equipmentRecords)) {
      res.status(400).json({
        success: false,
        message: 'Equipment records must be an array.',
      });
      return;
    }

    // Formulate the formatted list of questions
    const formattedRecords = equipmentRecords.map((item: any) => {
      const qId = item.questionId?._id || item.questionId;
      if (!mongoose.isValidObjectId(qId)) {
        throw new Error(`Invalid question ID: ${qId}`);
      }
      return {
        questionId: qId,
        status: item.status || 'Not Provided',
        remarks: item.remarks || '',
      };
    });

    // Find and update or insert new equipment record
    const updatedRecord = await VesselEquipmentRecord.findOneAndUpdate(
      { surveyReportId },
      {
        $set: {
          vesselId,
          equipmentRecords: formattedRecords,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    ).populate('equipmentRecords.questionId');

    res.status(200).json({
      success: true,
      message: 'Vessel equipment record saved successfully.',
      data: updatedRecord,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error saving vessel equipment record.',
      error: error.message,
    });
  }
};
