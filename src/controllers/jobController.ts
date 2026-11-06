import { Request, Response } from 'express';
import mongoose, { FilterQuery } from 'mongoose';
import Job, { IJob, JOB_STATUSES, JobStatus } from '../models/Job';
import RequestModel from '../models/Request';
import Quotation from '../models/Quotation';
import Vessel from '../models/Vessel';
import FirstEntry from '../models/FirstEntry';
import ScheduleII from '../models/ScheduleII';
import SurveyType from '../models/SurveyType';
import User from '../models/User';
import Role from '../models/Role';
import FirstEntrySurveyBooking from '../models/FirstEntrySurveyBooking';
import FirstEntrySurveyReport from '../models/FirstEntrySurveyReport';
import FirstEntryFullReport from '../models/FirstEntryFullReport';
import SurveyReport from '../models/SurveyReport';
import SCCCOS from '../models/SCCCOS';
import DockingSurveyCert from '../models/DockingSurveyCert';
import { AuthRequest } from '../middleware/auth';
import { rejectUnlessCan } from '../middleware/permission';
import { userCan } from '../utils/permissions';
import { ensureVesselUqmsNumber } from '../services/uqmsNumberService';
import { issueReportNumber } from '../services/reportNumberService';
import { scheduleIILabelFor } from '../config/certificateVariants';
import { getPrePopulatedData } from './firstEntrySurveyReportController';
import { bookingVisitLabels, generateFullReport } from './firstEntryFullReportController';
import {
  canViewJob,
  hasRequiredMssProof,
  isJobMember,
  isLeadSurveyor,
  jobEditBlockReason,
  loadJobLinks,
  managerSubmitBlockReason,
  loadJobDocumentStates,
  revokeJobSignatures,
  scopeJobsQuery,
  scopeMyJobsQuery,
  transitionJob,
} from '../services/jobWorkflow';
import {
  ASSISTANT_SURVEYOR_ROLE_NAME,
  SURVEYOR_ROLE_NAME,
  SURVEYOR_ROLE_NAMES,
  isMainSurveyType,
  sectorOfMainType,
} from '../config/surveyCategories';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v);

const fail = (res: Response, status: number, message: string) => {
  res.status(status).json({ success: false, message });
};

const serverError = (res: Response, message: string, error: any) => {
  res.status(500).json({ success: false, message, error: error?.message });
};

const JOB_POPULATE = [
  { path: 'surveyor', select: 'fullName nameWithInitials username email' },
  { path: 'assistantSurveyors', select: 'fullName nameWithInitials username email' },
  { path: 'surveyTypes', select: 'code name mainTypes sector' },
  { path: 'allocatedBy', select: 'fullName username' },
];

/** Request fields that may be corrected at Surveyor Allocation. */
const EDITABLE_REQUEST_FIELDS = [
  'vesselName', 'vesselCode', 'imoNumber', 'mmsiNumber', 'companyName', 'contactPersonName',
  'contactPersonNumber', 'registerdAddress', 'invoicingAddress', 'companyEmail', 'vesselType', 'areaOfOperation',
] as const;

/** Users holding one of the given fixed roles. */
const usersWithRoles = async (roleNames: string[]) => {
  const roles = await Role.find({ roleName: { $in: roleNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) } })
    .select('_id roleName')
    .lean();
  const roleNameById = new Map(roles.map((r) => [String(r._id), r.roleName.toLowerCase()]));
  const users = await User.find({ role: { $in: roles.map((r) => r._id) } })
    .select('fullName nameWithInitials username email role')
    .sort({ fullName: 1 })
    .lean();
  return users.map((u) => ({
    _id: String(u._id),
    fullName: u.fullName,
    nameWithInitials: u.nameWithInitials,
    username: u.username,
    email: u.email,
    roleName: roleNameById.get(String(u.role)) ?? '',
  }));
};

const validateSurveyors = async (
  surveyorId: unknown,
  assistantIds: unknown
): Promise<{ error?: string; surveyor?: string; assistants?: string[] }> => {
  if (!isId(surveyorId)) return { error: 'Select the surveyor for this job.' };
  const assistants = Array.isArray(assistantIds) ? [...new Set(assistantIds.filter(isId))] : [];
  const people = await usersWithRoles(SURVEYOR_ROLE_NAMES);
  const roleOf = new Map(people.map((p) => [p._id, p.roleName]));
  if (roleOf.get(surveyorId) !== SURVEYOR_ROLE_NAME) return { error: 'The lead surveyor must be a user with the Surveyor role.' };
  for (const id of assistants) {
    if (id === surveyorId) return { error: 'The lead surveyor cannot also be an assistant.' };
    if (![SURVEYOR_ROLE_NAME, ASSISTANT_SURVEYOR_ROLE_NAME].includes(roleOf.get(id) ?? '')) {
      return { error: 'Assistant surveyors must have the Surveyor or Assistant Surveyor role.' };
    }
  }
  return { surveyor: surveyorId, assistants };
};

const validateSurveyTypes = async (ids: unknown, mainType: string): Promise<{ error?: string; ids?: string[] }> => {
  const list = Array.isArray(ids) ? [...new Set(ids.filter(isId))] : [];
  if (list.length === 0) return { error: 'Select at least one survey (sub type).' };
  const found = await SurveyType.find({ _id: { $in: list } }).select('mainTypes').lean();
  if (found.length !== list.length) return { error: 'One or more survey types no longer exist.' };
  // A sub type may belong to several main types. Unmapped ones are allowed so the job can go ahead before the mapping is complete.
  const mismatch = found.find((t) => t.mainTypes?.length && !(t.mainTypes as string[]).includes(mainType));
  if (mismatch) return { error: 'All selected surveys must belong to the selected main survey type.' };
  return { ids: list };
};

/** Finds the vessel the request is about, or creates it from the request details. */
const findOrCreateVessel = async (request: any, vesselId: unknown, userId?: string) => {
  if (isId(vesselId)) {
    const vessel = await Vessel.findById(vesselId);
    if (vessel) return vessel;
  }
  if (request.uqmsNumber) {
    const vessel = await Vessel.findOne({ uqmsNumber: request.uqmsNumber });
    if (vessel) return vessel;
  }
  if (request.imoNumber) {
    const vessel = await Vessel.findOne({ imoNumber: request.imoNumber });
    if (vessel) return vessel;
  }
  return Vessel.create({
    vesselName: request.vesselName,
    vesselCode: request.vesselCode,
    imoNumber: request.imoNumber,
    mmsiNumber: request.mmsiNumber,
    vesselType: request.vesselType,
    areaOfOperation: request.areaOfOperation,
    registeredOwnerName: request.companyName,
    registeredOwnerAddress: request.registerdAddress,
    invoicingName: request.companyName,
    invoicingAddress: request.invoicingAddress,
    createdBy: userId,
    updatedBy: userId,
  });
};

const loadViewableJob = async (req: AuthRequest, res: Response): Promise<IJob | null> => {
  if (!isId(req.params.id)) {
    fail(res, 400, 'Invalid job ID.');
    return null;
  }
  const job = await Job.findById(req.params.id);
  if (!job) {
    fail(res, 404, 'Job not found.');
    return null;
  }
  if (!(await canViewJob(req, job))) {
    fail(res, 403, 'You are not booked on this job.');
    return null;
  }
  return job;
};

/** Loads a job the user works on (or manages) and that is still editable. */
const loadWorkableJob = async (req: AuthRequest, res: Response): Promise<IJob | null> => {
  const job = await loadViewableJob(req, res);
  if (!job) return null;
  const userId = req.user?.id ?? '';
  if (!isJobMember(job, userId) && !(await userCan(req, 'jobs', 'view-all'))) {
    fail(res, 403, 'You are not booked on this job.');
    return null;
  }
  const blocked = await jobEditBlockReason(req, job);
  if (blocked) {
    fail(res, 409, blocked);
    return null;
  }
  return job;
};

const sendJob = async (res: Response, jobId: unknown, status = 200, message?: string) => {
  const job = await Job.findById(jobId).populate(JOB_POPULATE);
  const links = job ? await loadJobLinks(job) : {};
  res.status(status).json({ success: true, message, data: job ? { ...job.toObject(), links } : null });
};

// ===========================================================================
// Surveyor Allocation
// ===========================================================================

/** Requests whose quotation was accepted and that have no job yet. */
export const getAllocationQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const accepted = await Quotation.find({ status: 'accepted' }).select('request quotationNumber').lean();
    const quotationByRequest = new Map(accepted.map((q) => [String(q.request), q.quotationNumber]));
    const allocated = await Job.find({ request: { $in: [...quotationByRequest.keys()] } }).select('request').lean();
    // Pre-V2 requests that already have a First Entry are brought in by the data migration instead.
    const legacy = await FirstEntry.find({ request: { $in: [...quotationByRequest.keys()] } }).select('request').lean();
    const taken = new Set([...allocated, ...legacy].map((j) => String(j.request)));
    const ids = [...quotationByRequest.keys()].filter((id) => !taken.has(id));

    const filter: FilterQuery<any> = { _id: { $in: ids }, status: { $ne: 'reject' } };
    const search = str(req.query.search);
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ vesselName: rx }, { requestNumber: rx }, { jobNumber: rx }, { companyName: rx }, { uqmsNumber: rx }];
    }
    const requests = await RequestModel.find(filter)
      .populate('vesselType', 'name group')
      .populate('areaOfOperation', 'name AreaCategory')
      .populate('surveyTypes', 'code name mainTypes sector')
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests.map((r) => ({ ...r, acceptedQuotationNumber: quotationByRequest.get(String(r._id)) })),
    });
  } catch (error: any) {
    serverError(res, 'Error loading the surveyor booking queue.', error);
  }
};

/** Users that can be allocated as surveyor or assistant surveyor. */
export const getAllocatableSurveyors = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await usersWithRoles(SURVEYOR_ROLE_NAMES);
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error: any) {
    serverError(res, 'Error loading surveyors.', error);
  }
};

/**
 * Allocate a surveyor to an accepted request. Issues the vessel's UQMS number (first allocation only),
 * marks the request successful, creates the First Entry for first entry jobs, and creates the job.
 */
export const allocateJob = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  try {
    const body = req.body ?? {};
    if (!isId(body.requestId)) return fail(res, 400, 'Select a request to book a surveyor for.');
    if (!isMainSurveyType(body.mainSurveyType)) return fail(res, 400, 'Select the main survey type.');
    const mainSurveyType = body.mainSurveyType;
    const sector = sectorOfMainType(mainSurveyType);

    const mssProofRequired = body.mssProofRequired !== false;
    if (!mssProofRequired && (await rejectUnlessCan(authReq, res, 'surveyor-allocation', 'override'))) return;

    const request = await RequestModel.findById(body.requestId);
    if (!request) return fail(res, 404, 'Request not found.');
    if (request.status === 'reject') return fail(res, 400, 'This request was rejected.');
    if (await Job.exists({ request: request._id })) return fail(res, 409, 'This request already has a surveyor booked.');

    const quotation = await Quotation.findOne({ request: request._id, status: 'accepted' }).select('_id quotationNumber').lean();
    if (!quotation) return fail(res, 400, 'A surveyor can only be booked after the quotation is accepted.');

    const people = await validateSurveyors(body.surveyorId, body.assistantSurveyorIds);
    if (people.error) return fail(res, 400, people.error);
    const surveyTypes = await validateSurveyTypes(body.surveyTypeIds, mainSurveyType);
    if (surveyTypes.error) return fail(res, 400, surveyTypes.error);

    // 1. Corrections to the request details.
    const edits = body.request && typeof body.request === 'object' ? body.request : {};
    for (const field of EDITABLE_REQUEST_FIELDS) {
      if (field in edits) (request as any)[field] = typeof edits[field] === 'string' ? edits[field].trim() : edits[field];
    }
    request.sector = sector;
    request.surveyTypes = surveyTypes.ids!.map((id) => new mongoose.Types.ObjectId(id));
    request.updatedBy = userId as any;
    await request.save();

    // 2. Vessel and its UQMS number (issued once per vessel).
    const vessel = await findOrCreateVessel(request, body.vesselId, userId);
    const uqmsNumber = await ensureVesselUqmsNumber(vessel._id);

    await RequestModel.findByIdAndUpdate(
      request._id,
      { $set: { uqmsNumber, status: 'success', updatedBy: userId } },
      { audit: { action: 'request.status', reason: 'Surveyor booked; UQMS number assigned.' } } as any
    );

    // 3. First Entry record and report number for first entry jobs.
    let firstEntryId: mongoose.Types.ObjectId | undefined;
    let reportNumber: string | undefined;
    if (mainSurveyType === 'first-entry') {
      reportNumber = await issueReportNumber();
      const existing = await FirstEntry.findOne({ request: request._id }).select('_id').lean();
      firstEntryId = existing?._id as mongoose.Types.ObjectId | undefined;
      if (!firstEntryId) {
        const fe = await FirstEntry.create({
          request: request._id,
          vessel: vessel._id,
          isQuoted: true,
          quotationNumber: quotation.quotationNumber,
          createdBy: userId,
          updatedBy: userId,
        });
        firstEntryId = fe._id as mongoose.Types.ObjectId;
      }
    }

    // 4. The job.
    const job = new Job({
      request: request._id,
      requestNumber: request.requestNumber,
      jobNumber: request.jobNumber,
      quotation: quotation._id,
      quotationNumber: quotation.quotationNumber,
      vessel: vessel._id,
      vesselName: vessel.vesselName,
      vesselCode: vessel.vesselCode || request.vesselCode,
      uqmsNumber,
      reportNumber,
      sector,
      mainSurveyType,
      surveyTypes: surveyTypes.ids,
      surveyor: people.surveyor,
      assistantSurveyors: people.assistants,
      mssProofRequired,
      firstEntry: firstEntryId,
      status: 'allocated',
      statusHistory: [{ from: null, to: 'allocated', by: userId, at: new Date() }],
      allocatedBy: userId,
      allocatedAt: new Date(),
    });
    job.$locals.audit = { action: 'job.allocate' };
    try {
      await job.save();
    } catch (err: any) {
      if (err?.code === 11000) return fail(res, 409, 'This request already has a surveyor booked.');
      throw err;
    }

    await sendJob(res, job._id, 201, `Surveyor booked. UQMS number ${uqmsNumber}${reportNumber ? `, report number ${reportNumber}` : ''}.`);
  } catch (error: any) {
    serverError(res, 'Error booking the surveyor.', error);
  }
};

/** Change the allocation (surveyors, survey types, MSS proof) before reporting starts. */
export const updateJobAllocation = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  try {
    if (!isId(req.params.id)) return fail(res, 400, 'Invalid job ID.');
    const job = await Job.findById(req.params.id);
    if (!job) return fail(res, 404, 'Job not found.');
    if (!['allocated', 'booked', 'in-progress'].includes(job.status)) {
      return fail(res, 409, 'The allocation can only be changed before the reporting is submitted.');
    }
    const body = req.body ?? {};

    if ('surveyorId' in body || 'assistantSurveyorIds' in body) {
      const people = await validateSurveyors(body.surveyorId ?? String(job.surveyor), body.assistantSurveyorIds ?? job.assistantSurveyors.map(String));
      if (people.error) return fail(res, 400, people.error);
      job.surveyor = people.surveyor as any;
      job.assistantSurveyors = people.assistants as any;
    }
    if ('surveyTypeIds' in body) {
      const types = await validateSurveyTypes(body.surveyTypeIds, job.mainSurveyType);
      if (types.error) return fail(res, 400, types.error);
      job.surveyTypes = types.ids as any;
      await RequestModel.findByIdAndUpdate(job.request, { $set: { surveyTypes: types.ids } });
    }
    if ('mssProofRequired' in body) {
      const next = body.mssProofRequired !== false;
      if (!next && job.mssProofRequired && (await rejectUnlessCan(authReq, res, 'surveyor-allocation', 'override'))) return;
      job.mssProofRequired = next;
    }
    if ('mainSurveyType' in body && body.mainSurveyType !== job.mainSurveyType) {
      if (job.status !== 'allocated') return fail(res, 409, 'The main survey type can only be changed before the visits are planned.');
      if (!isMainSurveyType(body.mainSurveyType)) return fail(res, 400, 'Invalid main survey type.');
      job.mainSurveyType = body.mainSurveyType;
      job.sector = sectorOfMainType(body.mainSurveyType);
    }
    await job.save();
    await sendJob(res, job._id, 200, 'Allocation updated.');
  } catch (error: any) {
    serverError(res, 'Error updating the allocation.', error);
  }
};

// ===========================================================================
// My Jobs / View Report / Authorization lists
// ===========================================================================

/**
 * Lists jobs. `scope=mine` (default) applies the user's visibility; `scope=authorization` lists jobs
 * waiting for the manager; `scope=completed` lists finished jobs for View Report.
 */
export const getJobs = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  try {
    const scope = str(req.query.scope) || 'mine';
    const filter: FilterQuery<IJob> = {};

    for (const field of ['sector', 'mainSurveyType'] as const) {
      const value = str(req.query[field]);
      if (value) filter[field] = value;
    }
    const status = str(req.query.status);
    if (status) {
      const statuses = status.split(',').filter((s) => (JOB_STATUSES as readonly string[]).includes(s));
      if (statuses.length) filter.status = { $in: statuses as JobStatus[] };
    }
    if (isId(req.query.surveyTypeId)) filter.surveyTypes = new mongoose.Types.ObjectId(req.query.surveyTypeId);
    if (isId(req.query.surveyorId)) {
      const sid = new mongoose.Types.ObjectId(req.query.surveyorId);
      filter.$or = [{ surveyor: sid }, { assistantSurveyors: sid }];
    }
    const from = str(req.query.from);
    const to = str(req.query.to);
    if (from || to) {
      filter.updatedAt = {};
      if (from) (filter.updatedAt as any).$gte = new Date(from);
      if (to) (filter.updatedAt as any).$lte = new Date(`${to}T23:59:59.999Z`);
    }
    const search = str(req.query.search);
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      const searchOr = [{ vesselName: rx }, { uqmsNumber: rx }, { jobNumber: rx }, { requestNumber: rx }, { vesselCode: rx }];
      filter.$and = [...((filter.$and as any[]) || []), { $or: searchOr }];
    }

    let query: FilterQuery<IJob>;
    if (scope === 'authorization') {
      if (await rejectUnlessCan(authReq, res, 'authorization', 'read')) return;
      query = { ...filter, status: 'pending-authorization' };
    } else if (scope === 'completed') {
      // View Report: surveyors and assistants only see their own completed jobs.
      if (await rejectUnlessCan(authReq, res, 'view-report', 'read')) return;
      query = await scopeJobsQuery(authReq, { ...filter, status: 'completed' });
    } else {
      // My Jobs: open jobs only; completed jobs move to View Report.
      if (await rejectUnlessCan(authReq, res, 'jobs', 'read')) return;
      query = await scopeMyJobsQuery(authReq, { $and: [filter, { status: { $ne: 'completed' } }] });
    }

    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const [total, data] = await Promise.all([
      Job.countDocuments(query),
      Job.find(query).populate(JOB_POPULATE).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    ]);
    const totalPages = Math.ceil(total / limit) || 1;
    res.status(200).json({
      success: true,
      count: total,
      pagination: { page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      data,
    });
  } catch (error: any) {
    serverError(res, 'Error loading jobs.', error);
  }
};

/** Counts per main survey type for the My Jobs tabs. */
export const getJobCounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = await scopeMyJobsQuery(req as AuthRequest, { status: { $ne: 'completed' } });
    const rows = await Job.aggregate([{ $match: query }, { $group: { _id: '$mainSurveyType', count: { $sum: 1 } } }]);
    res.status(200).json({ success: true, data: Object.fromEntries(rows.map((r) => [r._id, r.count])) });
  } catch (error: any) {
    serverError(res, 'Error counting jobs.', error);
  }
};

export const getJobById = async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await loadViewableJob(req as AuthRequest, res);
    if (!job) return;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id ?? '';
    const blocked = await jobEditBlockReason(authReq, job);
    const canApprove = await userCan(authReq, 'jobs.reporting', 'approve');
    const canViewAll = await userCan(authReq, 'jobs', 'view-all');
    const managerBlocked = await managerSubmitBlockReason(authReq, job);
    const populated = await Job.findById(job._id).populate(JOB_POPULATE).populate('request');
    res.status(200).json({
      success: true,
      data: {
        ...populated!.toObject(),
        links: await loadJobLinks(job),
        mssProofUploaded: await hasRequiredMssProof(job),
        documents: await loadJobDocumentStates(job),
        access: {
          isMember: isJobMember(job, userId),
          isLeadSurveyor: isLeadSurveyor(job, userId),
          canEdit: !blocked && (isJobMember(job, userId) || canViewAll),
          lockedReason: blocked,
          canReview: canApprove && job.status === 'submitted',
          canSubmit: !canApprove && job.status === 'in-progress' && (isJobMember(job, userId) || canViewAll),
          // The surveyor sees the "Submit for manager approval" button while the job is open; it stays disabled until ready.
          showSubmitToManager:
            canApprove && (isLeadSurveyor(job, userId) || canViewAll) && ['in-progress', 'submitted', 'surveyor-approved'].includes(job.status),
          canSubmitToManager: !managerBlocked,
          submitToManagerBlockedReason: managerBlocked,
          canAuthorize: job.status === 'pending-authorization' && (await userCan(authReq, 'authorization', 'approve')),
        },
      },
    });
  } catch (error: any) {
    serverError(res, 'Error loading the job.', error);
  }
};

// ===========================================================================
// Booking and reporting
// ===========================================================================

/** Links the survey booking made for this job. */
export const linkJobBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await loadWorkableJob(req as AuthRequest, res);
    if (!job) return;
    if (!isId(req.body?.bookingId)) return fail(res, 400, 'Invalid booking ID.');
    const booking = await FirstEntrySurveyBooking.findById(req.body.bookingId).select('requestIds').lean();
    if (!booking) return fail(res, 404, 'Booking not found.');
    if (!(booking.requestIds || []).some((id: any) => String(id) === String(job.request))) {
      return fail(res, 400, "The booking is not for this job's request.");
    }
    if (job.booking && String(job.booking) !== req.body.bookingId) return fail(res, 409, 'This job already has a booking.');

    await Job.updateOne({ _id: job._id }, { $set: { booking: req.body.bookingId } });
    if (job.status === 'allocated') {
      await transitionJob(job._id, ['allocated'], 'booked', { userId: (req as AuthRequest).user?.id, reason: 'Visits planned.' });
    }
    await sendJob(res, job._id, 200, 'Booking linked to the job.');
  } catch (error: any) {
    serverError(res, 'Error linking the booking.', error);
  }
};

/**
 * Opens the reporting workspace: creates the survey report (and its checklist) from the booking the
 * first time, then moves the job to in-progress.
 */
export const startJobReporting = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  try {
    const job = await loadViewableJob(req as AuthRequest, res);
    if (!job) return;
    if (job.surveyReport) return sendJob(res, job._id);
    if (!job.booking) return fail(res, 400, 'Book the survey before starting the reporting.');

    const blocked = await jobEditBlockReason(req as AuthRequest, job);
    if (blocked) return fail(res, 409, blocked);

    const booking = await FirstEntrySurveyBooking.findById(job.booking).select('visitDetails').lean();
    if (!booking?.visitDetails?.length) return fail(res, 400, 'Add at least one visit to the booking first.');

    let report = await FirstEntrySurveyReport.findOne({ bookingId: job.booking });
    if (!report) {
      const data = await getPrePopulatedData(String(job.booking));
      report = await FirstEntrySurveyReport.create({ ...data, status: 'Draft', createdBy: userId, updatedBy: userId });
      try {
        await generateFullReport(report);
      } catch (err: any) {
        console.error('Error generating the checklist for the job:', err.message);
      }
    }

    await Job.updateOne({ _id: job._id }, { $set: { surveyReport: report._id } });
    await transitionJob(job._id, ['allocated', 'booked'], 'in-progress', { userId, reason: 'Reporting started.' });
    await sendJob(res, job._id, 200, 'Reporting started.');
  } catch (error: any) {
    serverError(res, 'Error starting the reporting.', error);
  }
};

/** Clears the "last visit" flag on the booking so another visit can be added. */
export const unmarkLastVisit = async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await loadWorkableJob(req as AuthRequest, res);
    if (!job) return;
    if (!job.booking) return fail(res, 400, 'This job has no booking.');
    const booking = await FirstEntrySurveyBooking.findById(job.booking);
    if (!booking) return fail(res, 404, 'Booking not found.');

    const last = (booking.visitDetails || []).find((v: any) => v.isLastVisitDate || v.isLastVist);
    if (!last) return fail(res, 400, 'No visit is marked as the last visit.');
    if (String((last as any).status || '').toLowerCase() !== 'completed') {
      return fail(res, 400, 'The last visit can only be unmarked after it is completed.');
    }

    booking.visitDetails.forEach((v: any) => {
      v.isLastVisitDate = false;
      v.isLastVist = false;
    });
    booking.set('lastVisitDate', undefined);
    booking.set('lastVisit', undefined);
    booking.$locals.audit = { action: 'job.last-visit.unmark' };
    await booking.save();
    await sendJob(res, job._id, 200, 'Last visit unmarked.');
  } catch (error: any) {
    serverError(res, 'Error unmarking the last visit.', error);
  }
};

// ===========================================================================
// Workflow: submit → surveyor review → certificate signed → submit to manager → manager authorization
// ===========================================================================

/** An assistant surveyor submits the reporting to the lead surveyor. */
export const submitJob = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  try {
    const job = await loadWorkableJob(req as AuthRequest, res);
    if (!job) return;
    if (job.status !== 'in-progress') return fail(res, 409, 'Only reporting in progress can be submitted.');
    if (!(await hasRequiredMssProof(job))) return fail(res, 400, `Upload the MSS proof in the ${scheduleIILabelFor(job.vesselCode)} section before submitting.`);

    const updated = await transitionJob(job._id, ['in-progress'], 'submitted', {
      userId,
      action: 'job.submit',
      set: { submittedBy: userId, submittedAt: new Date() },
    });
    if (!updated) return fail(res, 409, 'The job changed while you were submitting it. Reload and try again.');
    await sendJob(res, job._id, 200, 'Submitted to the surveyor for review.');
  } catch (error: any) {
    serverError(res, 'Error submitting the job.', error);
  }
};

/** The surveyor sends the job, with its signed certificate, to the manager for authorization. */
export const submitJobToManager = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  try {
    const job = await loadViewableJob(authReq, res);
    if (!job) return;
    const blocked = await managerSubmitBlockReason(authReq, job);
    if (blocked) return fail(res, 400, blocked);

    const updated = await transitionJob(job._id, ['in-progress', 'surveyor-approved'], 'pending-authorization', {
      userId,
      action: 'job.submit-to-manager',
      reason: 'Submitted for manager approval.',
    });
    if (!updated) return fail(res, 409, 'The job changed while you were submitting it. Reload and try again.');
    await sendJob(res, job._id, 200, 'Submitted for manager approval.');
  } catch (error: any) {
    serverError(res, 'Error submitting the job for manager approval.', error);
  }
};

/** The surveyor approves or rejects the assistant's submitted reporting. */
export const reviewJob = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id ?? '';
  try {
    if (await rejectUnlessCan(authReq, res, 'jobs.reporting', 'approve')) return;
    const job = await loadViewableJob(authReq, res);
    if (!job) return;
    if (!isLeadSurveyor(job, userId) && !(await userCan(authReq, 'jobs', 'view-all'))) {
      return fail(res, 403, 'Only the lead surveyor of this job can review it.');
    }
    const decision = str(req.body?.decision);
    const reason = str(req.body?.reason);
    if (!['approve', 'reject'].includes(decision)) return fail(res, 400, 'Decision must be approve or reject.');
    if (decision === 'reject' && !reason) return fail(res, 400, 'Give a reason for rejecting.');

    const updated = await transitionJob(job._id, ['submitted'], decision === 'approve' ? 'surveyor-approved' : 'in-progress', {
      userId,
      reason: reason || undefined,
      action: decision === 'approve' ? 'job.review.approve' : 'job.review.reject',
    });
    if (!updated) return fail(res, 409, 'This job is no longer waiting for review.');
    await sendJob(res, job._id, 200, decision === 'approve' ? 'Reporting approved.' : 'Reporting sent back for changes.');
  } catch (error: any) {
    serverError(res, 'Error reviewing the job.', error);
  }
};

/** The manager approves the signed job (completed) or sends it back (signature revoked, editable again). */
export const authorizeJob = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  try {
    if (await rejectUnlessCan(authReq, res, 'authorization', 'approve')) return;
    if (!isId(req.params.id)) return fail(res, 400, 'Invalid job ID.');
    const job = await Job.findById(req.params.id);
    if (!job) return fail(res, 404, 'Job not found.');

    const decision = str(req.body?.decision);
    const reason = str(req.body?.reason);
    if (!['approve', 'reject'].includes(decision)) return fail(res, 400, 'Decision must be approve or reject.');
    if (decision === 'reject' && !reason) return fail(res, 400, 'Give a reason for rejecting.');

    if (decision === 'approve') {
      const updated = await transitionJob(job._id, ['pending-authorization'], 'completed', {
        userId,
        action: 'job.authorize.approve',
        set: { completedAt: new Date() },
      });
      if (!updated) return fail(res, 409, 'This job is no longer waiting for authorization.');
      return sendJob(res, job._id, 200, 'Job approved.');
    }

    const updated = await transitionJob(job._id, ['pending-authorization'], 'in-progress', {
      userId,
      reason,
      action: 'job.authorize.reject',
    });
    if (!updated) return fail(res, 409, 'This job is no longer waiting for authorization.');
    await revokeJobSignatures(req, updated, `Rejected by manager: ${reason}`);
    await sendJob(res, job._id, 200, 'Job sent back for changes. The report and certificate signatures were removed.');
  } catch (error: any) {
    serverError(res, 'Error authorizing the job.', error);
  }
};

// ===========================================================================
// Supporting documents and the Reports tab
// ===========================================================================

export const addSupportingDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await loadWorkableJob(req as AuthRequest, res);
    if (!job) return;
    const { name, key, url, contentType, size } = req.body ?? {};
    if (!str(name) || !str(key)) return fail(res, 400, 'Document name and key are required.');
    await Job.updateOne(
      { _id: job._id },
      { $push: { supportingDocuments: { name: str(name), key: str(key), url, contentType, size, uploadedAt: new Date(), uploadedBy: (req as AuthRequest).user?.id } } },
      { audit: { action: 'job.document.add', metadata: { name: str(name) } } } as any
    );
    await sendJob(res, job._id, 201, 'Document added.');
  } catch (error: any) {
    serverError(res, 'Error adding the document.', error);
  }
};

export const removeSupportingDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await loadWorkableJob(req as AuthRequest, res);
    if (!job) return;
    if (!isId(req.params.docId)) return fail(res, 400, 'Invalid document ID.');
    await Job.updateOne(
      { _id: job._id },
      { $pull: { supportingDocuments: { _id: req.params.docId } } },
      { audit: { action: 'job.document.delete' } } as any
    );
    await sendJob(res, job._id, 200, 'Document removed.');
  } catch (error: any) {
    serverError(res, 'Error removing the document.', error);
  }
};

type ReportItem = {
  category: string;
  name: string;
  /** A signable/generated PDF the viewer fetches through its own API. */
  docType?: 'scccos' | 'docking-cert' | 'survey-report' | 'daily-report' | 'daily-visit';
  docId?: string;
  /** Daily visit reports: the visit the report covers. */
  visit?: string;
  /** An uploaded file. */
  key?: string;
  url?: string;
  contentType?: string;
  signed?: boolean;
  generatedAt?: Date;
};

/** Everything the Reports tab lists for a job: uploads and generated PDFs. */
export const getJobReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await loadViewableJob(req as AuthRequest, res);
    if (!job) return;
    const items: ReportItem[] = [];
    const files = (category: string, docs: any[] = []) =>
      docs.forEach((d) => items.push({ category, name: d.name, key: d.key, url: d.url, contentType: d.contentType, generatedAt: d.uploadedAt }));

    if (job.firstEntry) {
      const schedule = await ScheduleII.findOne({ firstEntry: job.firstEntry }).lean();
      files(scheduleIILabelFor(job.vesselCode), schedule?.documents);
      files('MSS Proof', (schedule as any)?.mssProofDocuments);
    }
    files('Supporting Documents', job.supportingDocuments as any[]);

    if (job.surveyReport) {
      const sr = job.surveyReport;
      const [full, finalReport, docking, cos] = await Promise.all([
        FirstEntryFullReport.findOne({ firstEntrySurveyReportId: sr }).select('dailyReportPdfKey dailyReportPdfGeneratedAt eSignature checklist.visitNumber').lean(),
        SurveyReport.findOne({ firstEntrySurveyReportId: sr }).select('pdf certificateNumber eSignature').lean(),
        DockingSurveyCert.findOne({ surveyReportId: sr }).select('pdf certificateNumber eSignature').lean(),
        SCCCOS.findOne({ surveyReportId: sr }).select('pdf certificateNumber eSignature').lean(),
      ]);
      if ((full as any)?.dailyReportPdfKey) {
        items.push({ category: 'Checklist', name: 'Survey checklist', docType: 'daily-report', docId: String(full!._id), generatedAt: (full as any).dailyReportPdfGeneratedAt });
      }
      // One Daily Visit Report per visit that has checklist items recorded against it.
      if (full) {
        const recorded = new Set(((full as any).checklist || []).map((i: any) => String(i.visitNumber || '')).filter(Boolean));
        const booking = job.booking ? await FirstEntrySurveyBooking.findById(job.booking).select('visitDetails').lean() : null;
        bookingVisitLabels(booking)
          .filter((v) => recorded.has(v.label))
          .forEach((v) => items.push({ category: 'Daily Visit Reports', name: `Daily visit report · ${v.label}`, docType: 'daily-visit', docId: String(full._id), visit: v.label, generatedAt: v.visit.visitDate }));
      }
      if (finalReport) {
        items.push({ category: 'Report Generation', name: `Record of Equipment & Survey Report ${finalReport.certificateNumber ?? ''}`.trim(), docType: 'survey-report', docId: String(finalReport._id), signed: Boolean((finalReport as any).eSignature?.signedAt), generatedAt: (finalReport as any).pdf?.generatedAt });
      }
      if (docking) {
        items.push({ category: 'Report Generation', name: `Docking Survey Report ${docking.certificateNumber ?? ''}`.trim(), docType: 'docking-cert', docId: String(docking._id), signed: Boolean((docking as any).eSignature?.signedAt), generatedAt: (docking as any).pdf?.generatedAt });
      }
      if (cos) {
        items.push({ category: 'Certificate', name: `Certificate of Survey ${cos.certificateNumber ?? ''}`.trim(), docType: 'scccos', docId: String(cos._id), signed: Boolean((cos as any).eSignature?.signedAt), generatedAt: (cos as any).pdf?.generatedAt });
      }
    }
    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (error: any) {
    serverError(res, 'Error loading the reports.', error);
  }
};
