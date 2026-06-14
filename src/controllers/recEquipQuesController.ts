import { Request, Response } from 'express';
import mongoose from 'mongoose';
import RecEquipQues from '../models/RecEquipQues';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

// Get all RecEquipQues
export const getAllRecEquipQues = async (_req: Request, res: Response): Promise<void> => {
  try {
    const questions = await RecEquipQues.find().sort({ codeRefNo: 1, createdAt: 1 });
    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching recommended equipment questions.',
      error: error.message,
    });
  }
};

// Get RecEquipQues by ID
export const getRecEquipQuesById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid equipment question ID format.',
      });
      return;
    }

    const question = await RecEquipQues.findById(id);
    if (!question) {
      res.status(404).json({
        success: false,
        message: 'Equipment question not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: question,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching equipment question.',
      error: error.message,
    });
  }
};

// Create a new RecEquipQues
export const createRecEquipQues = async (req: Request, res: Response): Promise<void> => {
  try {
    const { codeRefNo, description } = req.body;

    if (!isNonEmptyString(codeRefNo)) {
      res.status(400).json({
        success: false,
        message: 'Code Ref. No is required.',
      });
      return;
    }

    if (!isNonEmptyString(description)) {
      res.status(400).json({
        success: false,
        message: 'Description is required.',
      });
      return;
    }

    const newQuestion = new RecEquipQues({
      codeRefNo: codeRefNo.trim(),
      description: description.trim(),
    });

    await newQuestion.save();

    res.status(201).json({
      success: true,
      message: 'Equipment question created successfully.',
      data: newQuestion,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error creating equipment question.',
      error: error.message,
    });
  }
};

// Update an existing RecEquipQues
export const updateRecEquipQues = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { codeRefNo, description } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid equipment question ID format.',
      });
      return;
    }

    const existingQuestion = await RecEquipQues.findById(id);
    if (!existingQuestion) {
      res.status(404).json({
        success: false,
        message: 'Equipment question not found.',
      });
      return;
    }

    const updates: any = {};

    if (codeRefNo !== undefined) {
      if (!isNonEmptyString(codeRefNo)) {
        res.status(400).json({
          success: false,
          message: 'Code Ref. No cannot be empty.',
        });
        return;
      }
      updates.codeRefNo = codeRefNo.trim();
    }

    if (description !== undefined) {
      if (!isNonEmptyString(description)) {
        res.status(400).json({
          success: false,
          message: 'Description cannot be empty.',
        });
        return;
      }
      updates.description = description.trim();
    }

    const updatedQuestion = await RecEquipQues.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Equipment question updated successfully.',
      data: updatedQuestion,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating equipment question.',
      error: error.message,
    });
  }
};

// Delete a RecEquipQues
export const deleteRecEquipQues = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid equipment question ID format.',
      });
      return;
    }

    const deletedQuestion = await RecEquipQues.findByIdAndDelete(id);
    if (!deletedQuestion) {
      res.status(404).json({
        success: false,
        message: 'Equipment question not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Equipment question deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting equipment question.',
      error: error.message,
    });
  }
};
