import { Request, Response } from 'express';
import mongoose from 'mongoose';
import VesselModel from '../models/Vessel';
import { getNextDocumentNumber } from '../services/documentNumberService';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const createVessel = async (req: Request, res: Response): Promise<void> => {
  try {
    const vesselData = req.body;

    if (!isNonEmptyString(vesselData.vesselName)) {
      res.status(400).json({ success: false, message: 'Vessel name is required.' });
      return;
    }

    const newVessel = new VesselModel({
      ...vesselData,
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    });

    await newVessel.save();

    const populatedVessel = await VesselModel.findById(newVessel._id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('sisterShips')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Vessel created successfully.',
      data: populatedVessel,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Duplicate key error. A vessel with this unique identifier already exists.', error: error.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Error creating vessel.', error: error.message });
  }
};

export const getAllVessels = async (_req: Request, res: Response): Promise<void> => {
  try {
    const vessels = await VesselModel.find()
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('sisterShips')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: vessels.length, data: vessels });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching vessels.', error: error.message });
  }
};

export const searchVessels = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string | undefined;

    let filter = {};
    if (query) {
      filter = {
        $or: [
          { uqmsNumber: { $regex: query, $options: 'i' } },
          { vesselName: { $regex: query, $options: 'i' } },
        ],
      };
    }

    const vessels = await VesselModel.find(filter)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('sisterShips')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({ success: true, count: vessels.length, data: vessels });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error searching vessels.', error: error.message });
  }
};

export const getVesselById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid vessel ID format.' });
      return;
    }

    const vessel = await VesselModel.findById(req.params.id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('sisterShips')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!vessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    res.status(200).json({ success: true, data: vessel });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching vessel.', error: error.message });
  }
};

export const updateVessel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid vessel ID format.' });
      return;
    }

    const updateData = { ...req.body };

    // Prevent overriding the auto-generated uqmsNumber
    delete updateData.uqmsNumber;

    if ((req as any).user?.id) {
      updateData.updatedBy = (req as any).user.id;
    }

    const updatedVessel = await VesselModel.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('sisterShips')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!updatedVessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Vessel updated successfully.',
      data: updatedVessel,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error updating vessel.', error: error.message });
  }
};

export const deleteVessel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid vessel ID format.' });
      return;
    }

    const vessel = await VesselModel.findByIdAndDelete(req.params.id);
    if (!vessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Vessel deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting vessel.', error: error.message });
  }
};
