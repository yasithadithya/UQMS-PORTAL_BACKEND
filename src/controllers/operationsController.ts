import { Request, Response } from 'express';
import mongoose from 'mongoose';
import VesselType from '../models/VesselType';
import SurveyType from '../models/SurveyType';
import AreaOfOperation from '../models/AreaOfOperation';
import RequestModel from '../models/Request';
import Job from '../models/Job';
import ChecklistQuestion from '../models/ChecklistQuestion';
import {
  MAIN_SURVEY_TYPE_LABELS, MainSurveyType, SUB_TYPE_SECTORS, SubTypeSector, isMainSurveyType, mainTypesForSector,
} from '../config/surveyCategories';

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

/* ── V2 survey configuration (Admin → Survey Configuration) ─────────────────────────────── */

type SurveyTypeInput = { code?: string; name?: string; description?: string; sector?: SubTypeSector; mainTypes?: MainSurveyType[] };

/**
 * Validates a create/update body. `current` is the stored record on update, so a partial body is
 * checked against the values it keeps (e.g. changing only the sector re-checks the main types).
 */
const parseSurveyTypeInput = (
  body: any,
  current?: { sector?: SubTypeSector; mainTypes?: MainSurveyType[] }
): { error?: string; data?: SurveyTypeInput } => {
  const data: SurveyTypeInput = {};
  for (const key of ['code', 'name'] as const) {
    if (body[key] === undefined) {
      if (!current) return { error: `Survey type ${key} is required.` };
      continue;
    }
    if (typeof body[key] !== 'string' || !body[key].trim()) return { error: `Survey type ${key} cannot be empty.` };
    data[key] = body[key].trim();
  }
  if (body.description !== undefined) data.description = typeof body.description === 'string' ? body.description.trim() : '';

  if (body.sector !== undefined) {
    if (!(SUB_TYPE_SECTORS as readonly string[]).includes(body.sector)) return { error: 'Sector must be marine, industrial or both.' };
    data.sector = body.sector;
  }

  // Legacy single `mainType` (null = unmapped) is still accepted.
  let mainTypes: unknown = body.mainTypes;
  if (mainTypes === undefined && body.mainType !== undefined) mainTypes = body.mainType === null ? [] : [body.mainType];
  if (mainTypes !== undefined) {
    if (!Array.isArray(mainTypes) || !mainTypes.every(isMainSurveyType)) return { error: 'Invalid main survey type.' };
    data.mainTypes = [...new Set(mainTypes as MainSurveyType[])];
  }

  const sector = data.sector ?? current?.sector ?? 'marine';
  const allowed = mainTypesForSector(sector);
  const effective = data.mainTypes ?? current?.mainTypes ?? [];
  const outside = effective.filter((m) => !allowed.includes(m));
  if (outside.length) {
    return { error: `${outside.map((m) => MAIN_SURVEY_TYPE_LABELS[m]).join(', ')} is not offered in the ${sector} sector. Change the sector to "both" or remove it.` };
  }
  return { data };
};

const duplicateMessage = (error: any): string =>
  error?.keyPattern?.name ? 'A survey type with this name already exists.' : 'A survey type with this code already exists.';

export const createSurveyType = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, data } = parseSurveyTypeInput(req.body ?? {});
    if (error) {
      res.status(400).json({ success: false, message: error });
      return;
    }
    const surveyType = await SurveyType.create(data);
    res.status(201).json({ success: true, message: 'Survey type created.', data: surveyType });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: duplicateMessage(error) });
      return;
    }
    res.status(500).json({ success: false, message: 'Error creating the survey type.', error: error.message });
  }
};

/** Updates any of code, name, description, sector and main types. Also serves the older PATCH /mapping route. */
export const updateSurveyType = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid survey type ID.' });
      return;
    }
    const surveyType = await SurveyType.findById(req.params.id);
    if (!surveyType) {
      res.status(404).json({ success: false, message: 'Survey type not found.' });
      return;
    }
    const { error, data } = parseSurveyTypeInput(req.body ?? {}, surveyType);
    if (error) {
      res.status(400).json({ success: false, message: error });
      return;
    }
    surveyType.set(data ?? {});
    await surveyType.save();
    res.status(200).json({ success: true, message: 'Survey type saved.', data: surveyType });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: duplicateMessage(error) });
      return;
    }
    res.status(500).json({ success: false, message: 'Error saving the survey type.', error: error.message });
  }
};

export const updateSurveyTypeMapping = updateSurveyType;

/** How many requests, jobs and checklist questions use each survey type: { [surveyTypeId]: counts }. */
const countUsage = async (ids?: mongoose.Types.ObjectId[]) => {
  const byType = (field: string) => [
    { $unwind: `$${field}` },
    ...(ids ? [{ $match: { [field]: { $in: ids } } }] : []),
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ];
  const [requests, jobs, checklist] = await Promise.all([
    RequestModel.aggregate(byType('surveyTypes')),
    Job.aggregate(byType('surveyTypes')),
    ChecklistQuestion.aggregate(byType('surveyCategories')),
  ]);
  const usage: Record<string, { requests: number; jobs: number; checklistQuestions: number }> = {};
  const add = (rows: { _id: unknown; count: number }[], key: 'requests' | 'jobs' | 'checklistQuestions') => {
    for (const row of rows) {
      const id = String(row._id);
      usage[id] ??= { requests: 0, jobs: 0, checklistQuestions: 0 };
      usage[id][key] = row.count;
    }
  };
  add(requests, 'requests');
  add(jobs, 'jobs');
  add(checklist, 'checklistQuestions');
  return usage;
};

export const getSurveyTypeUsage = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({ success: true, data: await countUsage() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error counting survey type usage.', error: error.message });
  }
};

/** Deletes a survey type only when nothing uses it; otherwise the admin should edit it instead. */
export const deleteSurveyType = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid survey type ID.' });
      return;
    }
    const id = new mongoose.Types.ObjectId(String(req.params.id));
    const used = (await countUsage([id]))[String(id)];
    if (used) {
      const parts = [
        used.requests && `${used.requests} request(s)`,
        used.jobs && `${used.jobs} job(s)`,
        used.checklistQuestions && `${used.checklistQuestions} checklist question(s)`,
      ].filter(Boolean);
      res.status(409).json({ success: false, message: `This survey type is used by ${parts.join(', ')} and cannot be deleted.` });
      return;
    }
    const deleted = await SurveyType.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Survey type not found.' });
      return;
    }
    res.status(200).json({ success: true, message: 'Survey type deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting the survey type.', error: error.message });
  }
};
