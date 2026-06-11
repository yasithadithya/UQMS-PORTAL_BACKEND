import { Request, Response } from 'express';
import mongoose from 'mongoose';
import VesselCode from '../models/VesselCode';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

// Get all vessel codes
export const getAllVesselCodes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const vesselCodes = await VesselCode.find().sort({ code: 1 });
    res.status(200).json({
      success: true,
      count: vesselCodes.length,
      data: vesselCodes,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vessel codes.',
      error: error.message,
    });
  }
};

// Get vessel code by ID
export const getVesselCodeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid vessel code ID format.',
      });
      return;
    }

    const vesselCode = await VesselCode.findById(id);
    if (!vesselCode) {
      res.status(404).json({
        success: false,
        message: 'Vessel code not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: vesselCode,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vessel code.',
      error: error.message,
    });
  }
};

// Create a new vessel code
export const createVesselCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, description } = req.body;

    if (!isNonEmptyString(code)) {
      res.status(400).json({
        success: false,
        message: 'Vessel code is required.',
      });
      return;
    }

    if (!isNonEmptyString(description)) {
      res.status(400).json({
        success: false,
        message: 'Vessel code description is required.',
      });
      return;
    }

    const newVesselCode = new VesselCode({
      code: code.trim(),
      description: description.trim(),
    });

    await newVesselCode.save();

    res.status(201).json({
      success: true,
      message: 'Vessel code created successfully.',
      data: newVesselCode,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Vessel code already exists.',
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error creating vessel code.',
      error: error.message,
    });
  }
};

// Update an existing vessel code
export const updateVesselCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { code, description } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid vessel code ID format.',
      });
      return;
    }

    const existingVesselCode = await VesselCode.findById(id);
    if (!existingVesselCode) {
      res.status(404).json({
        success: false,
        message: 'Vessel code not found.',
      });
      return;
    }

    const updates: any = {};

    if (code !== undefined) {
      if (!isNonEmptyString(code)) {
        res.status(400).json({
          success: false,
          message: 'Vessel code cannot be empty.',
        });
        return;
      }
      updates.code = code.trim();
    }

    if (description !== undefined) {
      if (!isNonEmptyString(description)) {
        res.status(400).json({
          success: false,
          message: 'Vessel code description cannot be empty.',
        });
        return;
      }
      updates.description = description.trim();
    }

    const updatedVesselCode = await VesselCode.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Vessel code updated successfully.',
      data: updatedVesselCode,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Vessel code already exists.',
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error updating vessel code.',
      error: error.message,
    });
  }
};

// Delete a vessel code
export const deleteVesselCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid vessel code ID format.',
      });
      return;
    }

    const deletedVesselCode = await VesselCode.findByIdAndDelete(id);
    if (!deletedVesselCode) {
      res.status(404).json({
        success: false,
        message: 'Vessel code not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Vessel code deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting vessel code.',
      error: error.message,
    });
  }
};
