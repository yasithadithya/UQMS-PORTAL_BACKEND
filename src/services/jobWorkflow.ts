import { Request, Response } from 'express';
import mongoose, { FilterQuery, Model } from 'mongoose';
import Job, { EDITABLE_JOB_STATUSES, IJob, JobStatus } from '../models/Job';
import FirstEntry from '../models/FirstEntry';
import ScheduleII from '../models/ScheduleII';
import FirstEntrySurveyReport from '../models/FirstEntrySurveyReport';
import FirstEntryFullReport from '../models/FirstEntryFullReport';
import VesselEquipmentRecord from '../models/VesselEquipmentRecord';
import SurveyReport from '../models/SurveyReport';
import SCCCOS from '../models/SCCCOS';
import DockingSurveyCert from '../models/DockingSurveyCert';
import SurveyType from '../models/SurveyType';
import User from '../models/User';
import type { AuthRequest } from '../middleware/auth';
import { roleNameOf, userCan } from '../utils/permissions';
import { SURVEYOR_ROLE_NAMES } from '../config/surveyCategories';
import { getSignableDocument } from './signableDocuments';
import { isElectronicallySigned } from './eSignatureLock';

const idOf = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'object' && '_id' in (value as any)) return String((value as any)._id);
  return String(value);
};

// ---------------------------------------------------------------------------
// Who can see a job
// ---------------------------------------------------------------------------

export const isJobMember = (job: Pick<IJob, 'surveyor' | 'assistantSurveyors'>, userId: string): boolean =>
  idOf(job.surveyor) === userId || (job.assistantSurveyors || []).some((id) => idOf(id) === userId);

export const isLeadSurveyor = (job: Pick<IJob, 'surveyor'>, userId: string): boolean => idOf(job.surveyor) === userId;

/** Surveyors and assistant surveyors only ever see the jobs allocated to them. */
export const isSurveyorRole = (req: AuthRequest): boolean => SURVEYOR_ROLE_NAMES.includes(roleNameOf(req.user?.role));

/** Whether the user is limited to their own jobs (surveyor roles, unless explicitly granted view-all). */
export const isRestrictedToOwnJobs = async (req: AuthRequest): Promise<boolean> =>
  isSurveyorRole(req) && !(await userCan(req, 'jobs', 'view-all'));

/** Everyone with My Jobs access sees every job, except surveyors and assistant surveyors. */
export const canViewAllJobs = async (req: AuthRequest): Promise<boolean> =>
  !(await isRestrictedToOwnJobs(req)) && (await userCan(req, 'jobs', 'read'));

/** Members always see their jobs; other users see every job unless they are a surveyor role. */
export const canViewJob = async (req: AuthRequest, job: IJob): Promise<boolean> => {
  const userId = req.user?.id ?? '';
  if (isJobMember(job, userId)) return true;
  if (await isRestrictedToOwnJobs(req)) return false;
  if ((await userCan(req, 'jobs', 'read')) && (await allowedJobSectors(req)).includes(job.sector)) return true;
  if (job.status === 'pending-authorization' && (await userCan(req, 'authorization', 'read'))) return true;
  if (job.status === 'completed' && (await userCan(req, 'view-report', 'read'))) return true;
  return false;
};

/** Limits a job query to the user's own jobs when they are a surveyor or assistant surveyor. */
export const scopeJobsQuery = async (req: AuthRequest, filter: FilterQuery<IJob>): Promise<FilterQuery<IJob>> => {
  if (!(await isRestrictedToOwnJobs(req))) return filter;
  const userId = new mongoose.Types.ObjectId(req.user?.id);
  return { $and: [filter, { $or: [{ surveyor: userId }, { assistantSurveyors: userId }] }] };
};

/** My Jobs sector modules: read on a sector's module is needed to list that sector's jobs. */
export const SECTOR_MODULE_KEYS = { marine: 'jobs.marine', industrial: 'jobs.industrial' } as const;

export const allowedJobSectors = async (req: AuthRequest): Promise<string[]> => {
  const sectors: string[] = [];
  for (const [sector, key] of Object.entries(SECTOR_MODULE_KEYS)) {
    if (await userCan(req, key, 'read')) sectors.push(sector);
  }
  return sectors;
};

/** My Jobs query: the user's visible jobs, in the sectors they have access to. */
export const scopeMyJobsQuery = async (req: AuthRequest, filter: FilterQuery<IJob>): Promise<FilterQuery<IJob>> =>
  scopeJobsQuery(req, { $and: [filter, { sector: { $in: await allowedJobSectors(req) } }] });


// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

const userName = async (userId?: string): Promise<string> => {
  if (!userId) return 'System';
  const user = await User.findById(userId).select('fullName nameWithInitials username').lean();
  return user?.fullName || user?.nameWithInitials || user?.username || '';
};

/**
 * Moves a job to `to` only if it is still in one of `from` (so two people acting at once cannot both
 * succeed). Returns the updated job, or null when the job was no longer in an allowed status.
 */
export const transitionJob = async (
  jobId: unknown,
  from: JobStatus[],
  to: JobStatus,
  opts: { userId?: string; reason?: string; action?: string; set?: Record<string, unknown>; unset?: Record<string, 1> } = {}
): Promise<IJob | null> => {
  const current = await Job.findOne({ _id: jobId, status: { $in: from } }).select('status').lean();
  if (!current) return null;

  const change = {
    from: current.status,
    to,
    by: opts.userId,
    byName: await userName(opts.userId),
    at: new Date(),
    reason: opts.reason,
  };
  const update: Record<string, unknown> = {
    $set: { status: to, ...(opts.set || {}) },
    $push: { statusHistory: change },
  };
  if (opts.unset) update.$unset = opts.unset;

  const updated = await Job.findOneAndUpdate({ _id: jobId, status: current.status }, update, {
    new: true,
    audit: { action: opts.action ?? 'job.status', reason: opts.reason, metadata: { from: current.status, to } },
  } as any);
  return updated as unknown as IJob | null;
};

// ---------------------------------------------------------------------------
// Records linked to a job
// ---------------------------------------------------------------------------

export interface JobLinks {
  firstEntryId?: string;
  scheduleIIId?: string;
  bookingId?: string;
  surveyReportId?: string;
  fullReportId?: string;
  equipmentRecordId?: string;
  finalReportId?: string;
  certificateId?: string;
  dockingCertId?: string;
}

export const loadJobLinks = async (job: IJob): Promise<JobLinks> => {
  const links: JobLinks = {
    firstEntryId: idOf(job.firstEntry) || undefined,
    bookingId: idOf(job.booking) || undefined,
    surveyReportId: idOf(job.surveyReport) || undefined,
  };
  if (links.firstEntryId) {
    const fe = await FirstEntry.findById(links.firstEntryId).select('scheduleII').lean();
    links.scheduleIIId = idOf(fe?.scheduleII) || undefined;
  }
  if (links.surveyReportId) {
    const sr = links.surveyReportId;
    const [full, ver, finalReport, cos, docking] = await Promise.all([
      FirstEntryFullReport.findOne({ firstEntrySurveyReportId: sr }).select('_id').lean(),
      VesselEquipmentRecord.findOne({ surveyReportId: sr }).select('_id').lean(),
      SurveyReport.findOne({ firstEntrySurveyReportId: sr }).select('_id').lean(),
      SCCCOS.findOne({ surveyReportId: sr }).select('_id').lean(),
      DockingSurveyCert.findOne({ surveyReportId: sr }).select('_id').lean(),
    ]);
    links.fullReportId = idOf(full?._id) || undefined;
    links.equipmentRecordId = idOf(ver?._id) || undefined;
    links.finalReportId = idOf(finalReport?._id) || undefined;
    links.certificateId = idOf(cos?._id) || undefined;
    links.dockingCertId = idOf(docking?._id) || undefined;
  }
  return links;
};

/** Whether the MSS proof the job requires has been uploaded. */
export const hasRequiredMssProof = async (job: IJob): Promise<boolean> => {
  if (!job.mssProofRequired) return true;
  if (!job.firstEntry) return false;
  const schedule = await ScheduleII.findOne({ firstEntry: job.firstEntry }).select('mssProofDocuments').lean();
  return Boolean((schedule as any)?.mssProofDocuments?.length);
};

// ---------------------------------------------------------------------------
// Edit lock (Phase 4)
// ---------------------------------------------------------------------------

export type JobRef = {
  jobId?: unknown;
  requestId?: unknown;
  firstEntryId?: unknown;
  bookingId?: unknown;
  surveyReportId?: unknown;
};

/** Finds the V2 job a reporting record belongs to. Pre-V2 records have none and are never locked here. */
export const findJobFor = async (ref: JobRef): Promise<IJob | null> => {
  if (ref.jobId) return Job.findById(ref.jobId);
  if (ref.surveyReportId) {
    const job = await Job.findOne({ surveyReport: ref.surveyReportId });
    if (job) return job;
    const report = await FirstEntrySurveyReport.findById(ref.surveyReportId).select('bookingId').lean();
    if (report?.bookingId) return Job.findOne({ booking: report.bookingId });
    return null;
  }
  if (ref.bookingId) return Job.findOne({ booking: ref.bookingId });
  if (ref.firstEntryId) return Job.findOne({ firstEntry: ref.firstEntryId });
  if (ref.requestId) return Job.findOne({ request: ref.requestId });
  return null;
};

/** Why the user may not change this job's reporting right now, or null when they may. */
export const jobEditBlockReason = async (req: AuthRequest, job: IJob | null): Promise<string | null> => {
  if (!job) return null;
  if (EDITABLE_JOB_STATUSES.includes(job.status)) return null;
  if (job.status === 'submitted') {
    return (await userCan(req, 'jobs.reporting', 'approve'))
      ? null
      : 'This job has been submitted for surveyor review. It can be edited again if the surveyor rejects it.';
  }
  if (job.status === 'pending-authorization') {
    return 'This job has been submitted for manager approval. It can be edited again if the manager rejects it.';
  }
  return 'This job has been approved and can no longer be edited.';
};

/** Sends a 409 and returns true when the job is locked for this user. */
export const rejectIfJobLocked = async (req: Request, res: Response, ref: JobRef): Promise<boolean> => {
  const job = await findJobFor(ref);
  const reason = await jobEditBlockReason(req as AuthRequest, job);
  if (!reason) return false;
  res.status(409).json({ success: false, message: reason, code: 'JOB_LOCKED' });
  return true;
};

/**
 * Vessels are shared by every job for that vessel, so a vessel is only locked while one of its jobs is
 * waiting for the manager.
 */
export const rejectIfVesselLocked = async (req: Request, res: Response, vesselId: unknown): Promise<boolean> => {
  const waiting = await Job.findOne({ vessel: vesselId, status: 'pending-authorization' }).select('_id').lean();
  if (!waiting) return false;
  res.status(409).json({
    success: false,
    message: 'A job for this vessel is waiting for manager approval, so the vessel details are locked.',
    code: 'JOB_LOCKED',
  });
  return true;
};

// ---------------------------------------------------------------------------
// Certificate signing hooks
// ---------------------------------------------------------------------------

/** Documents of a job the surveyor signs before the job goes to the manager. */
type JobSignedDocType = 'survey-report' | 'docking-cert' | 'scccos';

const JOB_SIGNED_DOCS: Record<JobSignedDocType, { model: Model<any>; field: string; label: string }> = {
  'survey-report': { model: SurveyReport, field: 'firstEntrySurveyReportId', label: 'survey report' },
  'docking-cert': { model: DockingSurveyCert, field: 'surveyReportId', label: 'docking survey report' },
  scccos: { model: SCCCOS, field: 'surveyReportId', label: 'certificate' },
};

export const isJobSignedDocType = (docType: string): docType is JobSignedDocType =>
  Object.prototype.hasOwnProperty.call(JOB_SIGNED_DOCS, docType);

const jobOfDocument = (docType: JobSignedDocType, doc: any): Promise<IJob | null> =>
  findJobFor({ surveyReportId: doc?.[JOB_SIGNED_DOCS[docType].field] });

/** Why a job's survey report, docking report or certificate cannot be signed yet (null = it can, or it has no job). */
export const jobDocumentSignBlockReason = async (req: AuthRequest, docType: string, doc: any): Promise<string | null> => {
  if (!isJobSignedDocType(docType)) return null;
  const job = await jobOfDocument(docType, doc);
  if (!job) return null;
  const label = JOB_SIGNED_DOCS[docType].label;
  if (!(await userCan(req, 'jobs.reporting', 'approve')) && !(await userCan(req, 'marine.certificates', 'sign-on-behalf'))) {
    return `Only the surveyor can sign the ${label}.`;
  }
  if (!['in-progress', 'surveyor-approved'].includes(job.status)) {
    return job.status === 'submitted'
      ? `Review and approve the submitted reporting before signing the ${label}.`
      : `This job is not ready for the ${label} to be signed.`;
  }
  if (docType === 'scccos' && !(await hasRequiredMssProof(job))) {
    return 'Upload the MSS proof in the Schedule II section before signing the certificate.';
  }
  return null;
};

/** Which reports a job needs. Keep in step with REPORT_RULES in the frontend FirstEntryWorkspace. */
export const jobReportsNeeded = async (job: IJob): Promise<{ surveyReport: boolean; docking: boolean }> => {
  const types = await SurveyType.find({ _id: { $in: job.surveyTypes || [] } }).select('name').lean();
  return {
    surveyReport: job.mainSurveyType === 'first-entry',
    docking: types.some((t: any) => /docking/i.test(t.name || '')),
  };
};

export interface JobDocumentState {
  id?: string;
  /** Whether the job needs this document. */
  required: boolean;
  /** Survey report only: finalized ("Approved"), which it must be before signing. */
  finalized?: boolean;
  signed: boolean;
}

/** Whether each signed document of the job exists, is needed and is signed. */
export const loadJobDocumentStates = async (job: IJob): Promise<Record<'surveyReport' | 'dockingCert' | 'certificate', JobDocumentState>> => {
  const needs = await jobReportsNeeded(job);
  const sr = job.surveyReport;
  const [report, docking, certificate] = sr
    ? await Promise.all([
      SurveyReport.findOne({ firstEntrySurveyReportId: sr }).select('status eSignature'),
      DockingSurveyCert.findOne({ surveyReportId: sr }).select('eSignature'),
      SCCCOS.findOne({ surveyReportId: sr }).select('eSignature'),
    ])
    : [null, null, null];
  const state = (doc: any, required: boolean): JobDocumentState => ({
    id: doc ? String(doc._id) : undefined,
    required,
    signed: Boolean(doc && isElectronicallySigned(doc)),
  });
  return {
    surveyReport: { ...state(report, needs.surveyReport), finalized: (report as any)?.status === 'Approved' },
    dockingCert: state(docking, needs.docking),
    certificate: state(certificate, true),
  };
};

/**
 * Why the surveyor cannot submit this job for manager approval yet (null = they can). Signing the
 * certificate does not send the job on; the surveyor does that from the Summary section.
 */
export const managerSubmitBlockReason = async (req: AuthRequest, job: IJob): Promise<string | null> => {
  if (!(await userCan(req, 'jobs.reporting', 'approve'))) return 'Only the surveyor can submit the job for manager approval.';
  if (!isLeadSurveyor(job, req.user?.id ?? '') && !(await userCan(req, 'jobs', 'view-all'))) {
    return 'Only the lead surveyor of this job can submit it for manager approval.';
  }
  if (job.status === 'submitted') return 'Review the reporting the assistant surveyor submitted first.';
  if (!['in-progress', 'surveyor-approved'].includes(job.status)) return 'This job is not ready to be submitted for manager approval.';
  if (!(await hasRequiredMssProof(job))) return 'Upload the MSS proof in the Schedule II section first.';
  const docs = await loadJobDocumentStates(job);
  const unsigned: string[] = [];
  if (docs.surveyReport.required && !docs.surveyReport.signed) unsigned.push('survey report');
  if (docs.dockingCert.required && !docs.dockingCert.signed) unsigned.push('docking survey report');
  if (!docs.certificate.signed) unsigned.push('certificate');
  if (unsigned.length) {
    const list = unsigned.length === 1 ? unsigned[0] : `${unsigned.slice(0, -1).join(', ')} and ${unsigned[unsigned.length - 1]}`;
    return `Sign the ${list} first.`;
  }
  return null;
};

/**
 * Removes the signatures on the job's reports and certificate when the manager sends it back. The survey
 * report also goes back to Draft, since a finalized report can no longer be edited.
 */
export const revokeJobSignatures = async (req: Request, job: IJob, reason: string): Promise<void> => {
  if (!job.surveyReport) return;
  for (const [docType, source] of Object.entries(JOB_SIGNED_DOCS)) {
    const doc = await source.model.findOne({ [source.field]: job.surveyReport });
    if (!doc) continue;
    const reopen = docType === 'survey-report' && (doc as any).status === 'Approved';
    if (!isElectronicallySigned(doc) && !reopen) continue;
    await source.model.updateOne(
      { _id: doc._id },
      { $unset: { eSignature: 1 }, ...(reopen ? { $set: { status: 'Draft' } } : {}) },
      { audit: { action: 'document.sign.revoke', reason, metadata: { previousSigner: (doc as any).eSignature?.signedByName } } } as any
    );
    await getSignableDocument(docType)!.regeneratePdf(req, String(doc._id));
  }
};

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------

/**
 * Unsigned PDFs released when their job is approved. V2 jobs sign the survey and docking reports before
 * they reach the manager; those two stay listed for jobs completed before that rule.
 */
const RELEASED_WITH_JOB: Record<string, { model: Model<any>; field: string }> = {
  'survey-report': { model: SurveyReport, field: 'firstEntrySurveyReportId' },
  'docking-cert': { model: DockingSurveyCert, field: 'surveyReportId' },
  'daily-report': { model: FirstEntryFullReport, field: 'firstEntrySurveyReportId' },
};

/** Whether an unsigned PDF is final because the manager approved its job. */
export const isReleasedByCompletedJob = async (docType: string, docId: string): Promise<boolean> => {
  const source = RELEASED_WITH_JOB[docType];
  if (!source || !mongoose.isValidObjectId(docId)) return false;
  const doc = await source.model.findById(docId).select(source.field).lean<Record<string, unknown>>();
  const surveyReportId = doc?.[source.field];
  if (!surveyReportId) return false;
  const job = await findJobFor({ surveyReportId });
  return job?.status === 'completed';
};

/** A report or certificate signature was removed outside the manager flow: a waiting job goes back to in-progress. */
export const onJobDocumentRevoked = async (docType: string, doc: any, userId: string, reason?: string): Promise<void> => {
  if (!isJobSignedDocType(docType)) return;
  const job = await jobOfDocument(docType, doc);
  if (!job) return;
  const label = JOB_SIGNED_DOCS[docType].label;
  const what = `${label.charAt(0).toUpperCase()}${label.slice(1)} signature revoked`;
  await transitionJob(job._id, ['pending-authorization'], 'in-progress', {
    userId,
    reason: reason ? `${what}: ${reason}` : `${what}.`,
  });
};
