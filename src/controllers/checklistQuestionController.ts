import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ChecklistQuestion from '../models/ChecklistQuestion';
import SurveyType from '../models/SurveyType';
import AreaOfOperation from '../models/AreaOfOperation';
import VesselType from '../models/VesselType';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const createChecklistQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { item, description, additionalFields, surveyCategories, lengths, areaOfOperations, boatTypes, vesselCode, qCategory } = req.body;

    // Validation
    if (!isNonEmptyString(item)) {
      res.status(400).json({ success: false, message: 'Item text is required.' });
      return;
    }

    if (!surveyCategories || !Array.isArray(surveyCategories) || surveyCategories.length === 0) {
      res.status(400).json({ success: false, message: 'surveyCategories must be a non-empty array.' });
      return;
    }

    const uniqueSurveyCategories = Array.from(new Set(surveyCategories.map((id: any) => String(id).trim())));
    if (!uniqueSurveyCategories.every((id) => mongoose.isValidObjectId(id))) {
      res.status(400).json({ success: false, message: 'One or more survey category IDs are invalid.' });
      return;
    }

    // Validate description
    let validatedDescription: string | null = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') {
        res.status(400).json({ success: false, message: 'description must be a string.' });
        return;
      }
      validatedDescription = description.trim() || null;
    }

    // Validate additional fields
    let validatedAdditionalFields: string[] = [];
    if (additionalFields !== undefined && additionalFields !== null) {
      if (!Array.isArray(additionalFields)) {
        res.status(400).json({ success: false, message: 'additionalFields must be an array.' });
        return;
      }
      const allowedFields = ['Qty', 'Capacity', 'Model or Serial Number'];
      const invalidFields = additionalFields.filter((f) => !allowedFields.includes(f));
      if (invalidFields.length > 0) {
        res.status(400).json({ success: false, message: `Invalid additional field(s): ${invalidFields.join(', ')}` });
        return;
      }
      validatedAdditionalFields = Array.from(new Set(additionalFields.map((f: any) => String(f).trim())));
    }

    // Validate lengths
    let validatedLengths: string[] = [];
    if (lengths !== undefined && lengths !== null) {
      if (!Array.isArray(lengths)) {
        res.status(400).json({ success: false, message: 'lengths must be an array.' });
        return;
      }
      const stringLengths = lengths.map((l: any) => String(l).trim());
      validatedLengths = Array.from(new Set(stringLengths));
    }

    // Validate areas of operations
    let uniqueAreaIds: string[] = [];
    if (areaOfOperations !== undefined && areaOfOperations !== null) {
      if (!Array.isArray(areaOfOperations)) {
        res.status(400).json({ success: false, message: 'areaOfOperations must be an array.' });
        return;
      }
      uniqueAreaIds = Array.from(new Set(areaOfOperations.map((id: any) => String(id).trim())));
      if (!uniqueAreaIds.every((id) => mongoose.isValidObjectId(id))) {
        res.status(400).json({ success: false, message: 'One or more area of operation IDs are invalid.' });
        return;
      }
    }

    // Validate boat types
    let uniqueBoatTypeIds: string[] = [];
    if (boatTypes !== undefined && boatTypes !== null) {
      if (!Array.isArray(boatTypes)) {
        res.status(400).json({ success: false, message: 'boatTypes must be an array.' });
        return;
      }
      uniqueBoatTypeIds = Array.from(new Set(boatTypes.map((id: any) => String(id).trim())));
      if (!uniqueBoatTypeIds.every((id) => mongoose.isValidObjectId(id))) {
        res.status(400).json({ success: false, message: 'One or more boat type IDs are invalid.' });
        return;
      }
    }

    // Validate vessel code and question category
    let validatedVesselCode: string | null = null;
    if (vesselCode !== undefined && vesselCode !== null) {
      if (typeof vesselCode !== 'string') {
        res.status(400).json({ success: false, message: 'vesselCode must be a string.' });
        return;
      }
      validatedVesselCode = vesselCode.trim() || null;
    }

    let validatedQCategory: string | null = null;
    if (qCategory !== undefined && qCategory !== null) {
      if (typeof qCategory !== 'string') {
        res.status(400).json({ success: false, message: 'qCategory must be a string.' });
        return;
      }
      validatedQCategory = qCategory.trim() || null;
    }

    // Verify database reference existence
    const surveyCategoryCount = await SurveyType.countDocuments({ _id: { $in: uniqueSurveyCategories } });
    if (surveyCategoryCount !== uniqueSurveyCategories.length) {
      res.status(400).json({ success: false, message: 'One or more survey categories were not found.' });
      return;
    }

    if (uniqueAreaIds.length > 0) {
      const areaCount = await AreaOfOperation.countDocuments({ _id: { $in: uniqueAreaIds } });
      if (areaCount !== uniqueAreaIds.length) {
        res.status(400).json({ success: false, message: 'One or more area of operations were not found.' });
        return;
      }
    }

    if (uniqueBoatTypeIds.length > 0) {
      const boatTypeCount = await VesselType.countDocuments({ _id: { $in: uniqueBoatTypeIds } });
      if (boatTypeCount !== uniqueBoatTypeIds.length) {
        res.status(400).json({ success: false, message: 'One or more boat types (VesselTypes) were not found.' });
        return;
      }
    }

    const newQuestion = new ChecklistQuestion({
      item: item.trim(),
      description: validatedDescription,
      additionalFields: validatedAdditionalFields,
      surveyCategories: uniqueSurveyCategories,
      lengths: validatedLengths,
      areaOfOperations: uniqueAreaIds,
      boatTypes: uniqueBoatTypeIds,
      vesselCode: validatedVesselCode,
      qCategory: validatedQCategory,
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    });

    await newQuestion.save();

    const populatedQuestion = await ChecklistQuestion.findById(newQuestion._id)
      .populate('surveyCategories')
      .populate('areaOfOperations')
      .populate('boatTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Checklist question created successfully.',
      data: populatedQuestion,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error creating checklist question.',
      error: error.message,
    });
  }
};

export const getAllChecklistQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, surveyCategory, areaOfOperation, boatType, length, vesselCode, qCategory } = req.query;
    const query: any = {};

    if (search && typeof search === 'string') {
      query.item = { $regex: search.trim(), $options: 'i' };
    }

    if (vesselCode && typeof vesselCode === 'string') {
      query.vesselCode = { $regex: vesselCode.trim(), $options: 'i' };
    }

    if (qCategory && typeof qCategory === 'string') {
      query.qCategory = { $regex: qCategory.trim(), $options: 'i' };
    }

    // Support single values or comma-separated lists for surveyCategory
    if (surveyCategory) {
      const categories = Array.isArray(surveyCategory) ? surveyCategory : String(surveyCategory).split(',');
      const validCategories = categories.map((id: any) => String(id).trim()).filter((id) => mongoose.isValidObjectId(id));
      if (validCategories.length > 0) {
        query.surveyCategories = { $in: validCategories };
      }
    }

    // Support single values or comma-separated lists for areaOfOperation
    if (areaOfOperation) {
      const areas = Array.isArray(areaOfOperation) ? areaOfOperation : String(areaOfOperation).split(',');
      const validAreas = areas.map((id: any) => String(id).trim()).filter((id) => mongoose.isValidObjectId(id));
      if (validAreas.length > 0) {
        query.areaOfOperations = { $in: validAreas };
      }
    }

    // Support single values or comma-separated lists for boatType
    if (boatType) {
      const types = Array.isArray(boatType) ? boatType : String(boatType).split(',');
      const validTypes = types.map((id: any) => String(id).trim()).filter((id) => mongoose.isValidObjectId(id));
      if (validTypes.length > 0) {
        query.boatTypes = { $in: validTypes };
      }
    }

    // Support single values or comma-separated lists for length
    if (length !== undefined && length !== '') {
      const lengthsArr = Array.isArray(length) ? length : String(length).split(',');
      const validLengths = lengthsArr.map((l: any) => String(l).trim()).filter((l) => l.length > 0);
      if (validLengths.length > 0) {
        query.lengths = { $in: validLengths };
      }
    }

    const questions = await ChecklistQuestion.find(query)
      .populate('surveyCategories')
      .populate('areaOfOperations')
      .populate('boatTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching checklist questions.',
      error: error.message,
    });
  }
};

export const getChecklistQuestionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid checklist question ID format.' });
      return;
    }

    const question = await ChecklistQuestion.findById(id)
      .populate('surveyCategories')
      .populate('areaOfOperations')
      .populate('boatTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!question) {
      res.status(404).json({ success: false, message: 'Checklist question not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: question,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching checklist question.',
      error: error.message,
    });
  }
};

export const updateChecklistQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { item, description, additionalFields, surveyCategories, lengths, areaOfOperations, boatTypes, vesselCode, qCategory } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid checklist question ID format.' });
      return;
    }

    const existingQuestion = await ChecklistQuestion.findById(id);
    if (!existingQuestion) {
      res.status(404).json({ success: false, message: 'Checklist question not found.' });
      return;
    }

    const updates: any = {};

    if (item !== undefined) {
      if (!isNonEmptyString(item)) {
        res.status(400).json({ success: false, message: 'Item text cannot be empty.' });
        return;
      }
      updates.item = item.trim();
    }

    if (description !== undefined) {
      if (description === null) {
        updates.description = null;
      } else {
        if (typeof description !== 'string') {
          res.status(400).json({ success: false, message: 'description must be a string.' });
          return;
        }
        updates.description = description.trim() || null;
      }
    }

    if (additionalFields !== undefined) {
      if (additionalFields === null) {
        updates.additionalFields = [];
      } else {
        if (!Array.isArray(additionalFields)) {
          res.status(400).json({ success: false, message: 'additionalFields must be an array.' });
          return;
        }
        const allowedFields = ['Qty', 'Capacity', 'Model or Serial Number'];
        const invalidFields = additionalFields.filter((f) => !allowedFields.includes(f));
        if (invalidFields.length > 0) {
          res.status(400).json({ success: false, message: `Invalid additional field(s): ${invalidFields.join(', ')}` });
          return;
        }
        updates.additionalFields = Array.from(new Set(additionalFields.map((f: any) => String(f).trim())));
      }
    }

    if (surveyCategories !== undefined) {
      if (!Array.isArray(surveyCategories) || surveyCategories.length === 0) {
        res.status(400).json({ success: false, message: 'surveyCategories must be a non-empty array.' });
        return;
      }
      const uniqueSurveyCategories = Array.from(new Set(surveyCategories.map((id: any) => String(id).trim())));
      if (!uniqueSurveyCategories.every((id) => mongoose.isValidObjectId(id))) {
        res.status(400).json({ success: false, message: 'One or more survey category IDs are invalid.' });
        return;
      }
      const surveyCategoryCount = await SurveyType.countDocuments({ _id: { $in: uniqueSurveyCategories } });
      if (surveyCategoryCount !== uniqueSurveyCategories.length) {
        res.status(400).json({ success: false, message: 'One or more survey categories were not found.' });
        return;
      }
      updates.surveyCategories = uniqueSurveyCategories;
    }

    if (lengths !== undefined) {
      if (lengths === null) {
        updates.lengths = [];
      } else {
        if (!Array.isArray(lengths)) {
          res.status(400).json({ success: false, message: 'lengths must be an array.' });
          return;
        }
        const stringLengths = lengths.map((l: any) => String(l).trim());
        updates.lengths = Array.from(new Set(stringLengths));
      }
    }

    if (areaOfOperations !== undefined) {
      if (areaOfOperations === null) {
        updates.areaOfOperations = [];
      } else {
        if (!Array.isArray(areaOfOperations)) {
          res.status(400).json({ success: false, message: 'areaOfOperations must be an array.' });
          return;
        }
        const uniqueAreaIds = Array.from(new Set(areaOfOperations.map((id: any) => String(id).trim())));
        if (!uniqueAreaIds.every((id) => mongoose.isValidObjectId(id))) {
          res.status(400).json({ success: false, message: 'One or more area of operation IDs are invalid.' });
          return;
        }
        const areaCount = await AreaOfOperation.countDocuments({ _id: { $in: uniqueAreaIds } });
        if (areaCount !== uniqueAreaIds.length) {
          res.status(400).json({ success: false, message: 'One or more area of operations were not found.' });
          return;
        }
        updates.areaOfOperations = uniqueAreaIds;
      }
    }

    if (boatTypes !== undefined) {
      if (boatTypes === null) {
        updates.boatTypes = [];
      } else {
        if (!Array.isArray(boatTypes)) {
          res.status(400).json({ success: false, message: 'boatTypes must be an array.' });
          return;
        }
        const uniqueBoatTypeIds = Array.from(new Set(boatTypes.map((id: any) => String(id).trim())));
        if (!uniqueBoatTypeIds.every((id) => mongoose.isValidObjectId(id))) {
          res.status(400).json({ success: false, message: 'One or more boat type IDs are invalid.' });
          return;
        }
        const boatTypeCount = await VesselType.countDocuments({ _id: { $in: uniqueBoatTypeIds } });
        if (boatTypeCount !== uniqueBoatTypeIds.length) {
          res.status(400).json({ success: false, message: 'One or more boat types (VesselTypes) were not found.' });
          return;
        }
        updates.boatTypes = uniqueBoatTypeIds;
      }
    }

    if (vesselCode !== undefined) {
      if (vesselCode === null) {
        updates.vesselCode = null;
      } else {
        if (typeof vesselCode !== 'string') {
          res.status(400).json({ success: false, message: 'vesselCode must be a string.' });
          return;
        }
        updates.vesselCode = vesselCode.trim() || null;
      }
    }

    if (qCategory !== undefined) {
      if (qCategory === null) {
        updates.qCategory = null;
      } else {
        if (typeof qCategory !== 'string') {
          res.status(400).json({ success: false, message: 'qCategory must be a string.' });
          return;
        }
        updates.qCategory = qCategory.trim() || null;
      }
    }

    if ((req as any).user?.id) {
      updates.updatedBy = (req as any).user.id;
    }

    const updatedQuestion = await ChecklistQuestion.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('surveyCategories')
      .populate('areaOfOperations')
      .populate('boatTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'Checklist question updated successfully.',
      data: updatedQuestion,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating checklist question.',
      error: error.message,
    });
  }
};

export const deleteChecklistQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid checklist question ID format.' });
      return;
    }

    const question = await ChecklistQuestion.findByIdAndDelete(id);
    if (!question) {
      res.status(404).json({ success: false, message: 'Checklist question not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Checklist question deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting checklist question.',
      error: error.message,
    });
  }
};
