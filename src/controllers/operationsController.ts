import { Request, Response } from 'express';
import VesselType from '../models/VesselType';
import SurveyType from '../models/SurveyType';
import AreaOfOperation from '../models/AreaOfOperation';
import { isMainSurveyType } from '../config/surveyCategories';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getAllVesselTypes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const vesselTypes = await VesselType.find().sort({ group: 1, name: 1 });
    res.status(200).json({ success: true, count: vesselTypes.length, data: vesselTypes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching vessel types.', error: error.message });
  }
};

export const getAllSurveyTypes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const surveyTypes = await SurveyType.find().sort({ name: 1, code: 1 });
    res.status(200).json({ success: true, count: surveyTypes.length, data: surveyTypes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching survey types.', error: error.message });
  }
};

export const getAllAreaOperations = async (_req: Request, res: Response): Promise<void> => {
  try {
    const areas = await AreaOfOperation.find().sort({ AreaCategory: 1 });
    res.status(200).json({ success: true, count: areas.length, data: areas });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching area operations.', error: error.message });
  }
};

export const searchVesselTypesByGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const group = typeof req.query.group === 'string' ? req.query.group.trim() : '';
    if (!group) {
      res.status(400).json({ success: false, message: 'Query parameter "group" is required.' });
      return;
    }

    const regex = new RegExp(escapeRegex(group), 'i');
    const vesselTypes = await VesselType.find({ group: regex }).sort({ group: 1, name: 1 });
    res.status(200).json({ success: true, count: vesselTypes.length, data: vesselTypes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error searching vessel types.', error: error.message });
  }
};

export const searchSurveyTypes = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';

    if (!code && !name) {
      res.status(400).json({ success: false, message: 'Query parameter "code" or "name" is required.' });
      return;
    }

    const conditions = [] as Array<Record<string, RegExp>>;
    if (code) {
      conditions.push({ code: new RegExp(escapeRegex(code), 'i') });
    }
    if (name) {
      conditions.push({ name: new RegExp(escapeRegex(name), 'i') });
    }

    const filter = conditions.length > 1 ? { $or: conditions } : conditions[0];
    const surveyTypes = await SurveyType.find(filter).sort({ name: 1, code: 1 });
    res.status(200).json({ success: true, count: surveyTypes.length, data: surveyTypes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error searching survey types.', error: error.message });
  }
};

export const searchAreaOperationsByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const areaCategory = typeof req.query.areaCategory === 'string' ? req.query.areaCategory.trim() : '';
    if (!areaCategory) {
      res.status(400).json({ success: false, message: 'Query parameter "areaCategory" is required.' });
      return;
    }

    const regex = new RegExp(escapeRegex(areaCategory), 'i');
    const areas = await AreaOfOperation.find({ AreaCategory: regex }).sort({ AreaCategory: 1 });
    res.status(200).json({ success: true, count: areas.length, data: areas });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error searching area operations.', error: error.message });
  }
};

/** V2: set which main survey type (and sector) a survey sub type belongs to. */
export const updateSurveyTypeMapping = async (req: Request, res: Response): Promise<void> => {
  try {
    const { mainType, sector } = req.body ?? {};
    const update: Record<string, unknown> = {};
    if (mainType !== undefined) {
      if (mainType !== null && !isMainSurveyType(mainType)) {
        res.status(400).json({ success: false, message: 'Invalid main survey type.' });
        return;
      }
      update.mainType = mainType;
    }
    if (sector !== undefined) {
      if (!['marine', 'industrial', 'both'].includes(sector)) {
        res.status(400).json({ success: false, message: 'Sector must be marine, industrial or both.' });
        return;
      }
      update.sector = sector;
    }
    const surveyType = await SurveyType.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!surveyType) {
      res.status(404).json({ success: false, message: 'Survey type not found.' });
      return;
    }
    res.status(200).json({ success: true, message: 'Survey type mapping saved.', data: surveyType });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error saving the survey type mapping.', error: error.message });
  }
};
