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
    return 'This job is signed and waiting for manager approval. It can be edited again if the manager rejects it.';
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
 * signed and waiting for the manager.
 */
export const rejectIfVesselLocked = async (req: Request, res: Response, vesselId: unknown): Promise<boolean> => {
  const waiting = await Job.findOne({ vessel: vesselId, status: 'pending-authorization' }).select('_id').lean();
  if (!waiting) return false;
  res.status(409).json({
    success: false,
    message: 'A job for this vessel is signed and waiting for manager approval, so the vessel details are locked.',
    code: 'JOB_LOCKED',
  });
  return true;
};

// ---------------------------------------------------------------------------
// Certificate signing hooks
// ---------------------------------------------------------------------------

/** Why the certificate of a job cannot be signed yet (null = it can, or the certificate has no job). */
export const certificateSignBlockReason = async (req: AuthRequest, certificate: any): Promise<string | null> => {
  const job = await findJobFor({ surveyReportId: certificate?.surveyReportId });
  if (!job) return null;
  if (!(await userCan(req, 'jobs.reporting', 'approve')) && !(await userCan(req, 'marine.certificates', 'sign-on-behalf'))) {
    return 'Only the surveyor can sign the certificate.';
  }
  if (!['in-progress', 'surveyor-approved'].includes(job.status)) {
    return job.status === 'submitted'
      ? 'Review and approve the submitted reporting before signing the certificate.'
      : 'This job is not ready for the certificate to be signed.';
  }
  if (!(await hasRequiredMssProof(job))) return 'Upload the MSS proof in the Schedule II section before signing the certificate.';
  return null;
};

/** After a certificate is signed, its job goes to the manager for authorization. */
export const onCertificateSigned = async (certificate: any, userId: string): Promise<void> => {
  const job = await findJobFor({ surveyReportId: certificate?.surveyReportId });
  if (!job) return;
  await transitionJob(job._id, ['in-progress', 'surveyor-approved'], 'pending-authorization', {
    userId,
    reason: 'Certificate signed.',
  });
};

/** Removes the certificate's signature when the manager sends a job back, so it can be edited again. */
export const revokeJobCertificateSignature = async (req: Request, job: IJob, reason: string): Promise<void> => {
  if (!job.surveyReport) return;
  const certificate = await SCCCOS.findOne({ surveyReportId: job.surveyReport });
  if (!certificate || !isElectronicallySigned(certificate)) return;
  const handler = getSignableDocument('scccos')!;
  await SCCCOS.updateOne(
    { _id: certificate._id },
    { $unset: { eSignature: 1 } },
    { audit: { action: 'document.sign.revoke', reason, metadata: { previousSigner: (certificate as any).eSignature?.signedByName } } } as any
  );
  await handler.regeneratePdf(req, String(certificate._id));
};

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------

/** In V2 only the certificate is e-signed; these PDFs are released when their job is approved. */
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

/** A certificate's signature was removed outside the manager flow: the job goes back to in-progress. */
export const onCertificateRevoked = async (certificate: any, userId: string, reason?: string): Promise<void> => {
  const job = await findJobFor({ surveyReportId: certificate?.surveyReportId });
  if (!job) return;
  await transitionJob(job._id, ['pending-authorization'], 'in-progress', {
    userId,
    reason: reason ? `Certificate signature revoked: ${reason}` : 'Certificate signature revoked.',
  });
};
