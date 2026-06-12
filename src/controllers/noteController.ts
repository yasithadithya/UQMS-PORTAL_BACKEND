import { Request, Response } from 'express';
import mongoose from 'mongoose';
import NoteModel, { INoteItem } from '../models/Note';
import VesselModel from '../models/Vessel';

const prefixMap: Record<string, string> = {
  'Hull': 'HA',
  'Machinery': 'MA',
  'Equipment': 'EQ'
};

/**
 * Get all notes for a specific vessel
 */
export const getNotesByVesselId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vesselId } = req.params;

    if (!vesselId || !mongoose.isValidObjectId(vesselId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Vessel ID.' });
      return;
    }

    const noteDoc = await NoteModel.findOne({ vesselId })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!noteDoc) {
      // If no notes exist yet, return a mock empty structure to simplify frontend consumption
      res.status(200).json({
        success: true,
        data: {
          vesselId,
          notes: []
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: noteDoc
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching notes for vessel.',
      error: error.message
    });
  }
};

/**
 * Create or update notes for a vessel in bulk
 */
export const upsertVesselNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vesselId } = req.params;
    const { notes } = req.body;
    const userId = (req as any).user?.id;

    if (!vesselId || !mongoose.isValidObjectId(vesselId)) {
      res.status(400).json({ success: false, message: 'Invalid or missing Vessel ID.' });
      return;
    }

    if (!notes || !Array.isArray(notes)) {
      res.status(400).json({ success: false, message: 'Notes must be provided as an array.' });
      return;
    }

    // Verify vessel exists
    const vessel = await VesselModel.findById(vesselId);
    if (!vessel) {
      res.status(404).json({ success: false, message: 'Vessel not found.' });
      return;
    }

    // Initialize highest numbering trackers per category/type
    const highestNum: Record<string, number> = {
      'Hull': -1,
      'Machinery': -1,
      'Equipment': -1
    };

    // 1. Scan incoming notes that already have a code matching the correct prefix
    notes.forEach((note: any) => {
      if (note.noteCode && note.type) {
        const prefix = prefixMap[note.type];
        if (prefix && note.noteCode.startsWith(prefix)) {
          const suffix = note.noteCode.slice(prefix.length);
          const num = parseInt(suffix, 10);
          if (!isNaN(num) && num > highestNum[note.type]) {
            highestNum[note.type] = num;
          }
        }
      }
    });

    // 2. Process notes and assign codes where missing/incorrect
    const processedNotes: INoteItem[] = notes.map((note: any) => {
      const type = note.type;
      const prefix = prefixMap[type] || 'UN';

      let code = note.noteCode;
      if (!code || !code.startsWith(prefix)) {
        highestNum[type] = (highestNum[type] ?? -1) + 1;
        const nextNum = highestNum[type];
        code = `${prefix}${String(nextNum).padStart(3, '0')}`;
      }

      return {
        noteCategory: note.noteCategory,
        noteCode: code,
        description: note.description,
        type: note.type,
        status: note.status || 'new',
        dueDate: note.dueDate ? new Date(note.dueDate) : undefined
      };
    });

    // 3. Upsert the Note document for this vessel
    const updatePayload: any = {
      notes: processedNotes,
      updatedBy: userId
    };

    // Find if a document already exists to decide whether to set createdBy
    const existingDoc = await NoteModel.findOne({ vesselId });
    if (!existingDoc) {
      updatePayload.vesselId = vesselId;
      updatePayload.createdBy = userId;
    }

    const savedDoc = await NoteModel.findOneAndUpdate(
      { vesselId },
      { $set: updatePayload },
      { new: true, upsert: true, runValidators: true }
    )
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'Vessel notes updated successfully.',
      data: savedDoc
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating vessel notes.',
      error: error.message
    });
  }
};
