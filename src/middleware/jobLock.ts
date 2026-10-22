import { Request, Response, NextFunction, RequestHandler } from 'express';
import mongoose, { Model } from 'mongoose';
import ScheduleII from '../models/ScheduleII';
import FirstEntryFullReport from '../models/FirstEntryFullReport';
import SurveyReport from '../models/SurveyReport';
import SCCCOS from '../models/SCCCOS';
import DockingSurveyCert from '../models/DockingSurveyCert';
import { JobRef, rejectIfJobLocked, rejectIfVesselLocked } from '../services/jobWorkflow';

/**
 * V2 edit lock for the reporting APIs. Each guard finds the job a record belongs to and refuses the
 * write (409) while the job is submitted, signed or approved. Records without a job (pre-V2) pass.
 */
type Resolver = (req: Request) => Promise<JobRef | null>;

const valid = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v);

const guard = (resolve: Resolver): RequestHandler => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ref = await resolve(req);
    if (ref && (await rejectIfJobLocked(req, res, ref))) return;
    next();
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error checking whether the job is locked.', error: error.message });
  }
};

/** Follows `field` on the record with id `req.params[param]` to the record that identifies the job. */
const via = (model: Model<any>, field: string, refKey: keyof JobRef, param = 'id'): Resolver => async (req) => {
  const id = req.params[param];
  if (!valid(id)) return null;
  const doc = await model.findById(id).select(field).lean<Record<string, unknown>>();
  return doc?.[field] ? { [refKey]: doc[field] } : null;
};

const param = (refKey: keyof JobRef, name = 'id'): Resolver => async (req) =>
  valid(req.params[name]) ? { [refKey]: req.params[name] } : null;

const body = (refKey: keyof JobRef, field: string): Resolver => async (req) =>
  valid(req.body?.[field]) ? { [refKey]: req.body[field] } : null;

export const jobLock = {
  firstEntryParam: guard(param('firstEntryId')),
  firstEntryBody: guard(body('firstEntryId', 'firstEntryId')),
  scheduleParam: guard(via(ScheduleII, 'firstEntry', 'firstEntryId', 'scheduleId')),
  bookingParam: guard(param('bookingId')),
  bookingBody: guard(body('bookingId', 'bookingId')),
  surveyReportParam: (name = 'id') => guard(param('surveyReportId', name)),
  surveyReportBody: (field = 'surveyReportId') => guard(body('surveyReportId', field)),
  fullReportParam: guard(via(FirstEntryFullReport, 'firstEntrySurveyReportId', 'surveyReportId')),
  finalReportParam: guard(via(SurveyReport, 'firstEntrySurveyReportId', 'surveyReportId')),
  certificateParam: guard(via(SCCCOS, 'surveyReportId', 'surveyReportId')),
  dockingParam: guard(via(DockingSurveyCert, 'surveyReportId', 'surveyReportId')),
  vesselParam: (async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (valid(req.params.id) && (await rejectIfVesselLocked(req, res, req.params.id))) return;
      next();
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Error checking whether the vessel is locked.', error: error.message });
    }
  }) as RequestHandler,
};
