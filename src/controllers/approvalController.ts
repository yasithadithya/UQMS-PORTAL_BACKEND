import { Request, Response, RequestHandler } from 'express';
import mongoose, { Model } from 'mongoose';
import ApprovalRequest, {
  APPROVAL_ENTITY_TYPES,
  APPROVAL_STATUSES,
  ApprovalEntityType,
  IApprovalRequest,
  OPEN_STATUSES,
} from '../models/ApprovalRequest';
import ChecklistQuestion from '../models/ChecklistQuestion';
import SurveyType from '../models/SurveyType';
import AreaOfOperation from '../models/AreaOfOperation';
import VesselType from '../models/VesselType';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { rejectUnlessCan } from '../middleware/permission';
import { userCanAny } from '../utils/permissions';
import { paginate } from '../utils/pagination';
import {
  createChecklistQuestion,
  deleteChecklistQuestion,
  updateChecklistQuestion,
} from './checklistQuestionController';

type Operation = IApprovalRequest['operation'];

/** How a field is shown to the approver. `ref` turns stored IDs into names. */
interface ApprovalField {
  key: string;
  label: string;
  ref?: { model: Model<any>; select: string; name: (doc: any) => string };
  /** Shown when the value is empty (e.g. "General" for no category). */
  empty?: string;
}

interface ApprovalHandler {
  /** Permission module whose create/update/delete action is needed to propose a change. */
  moduleKey: string;
  label: (payload: any, before: any) => string;
  loadCurrent: (id: string) => Promise<Record<string, unknown> | null>;
  /** The existing controllers, so accepted changes go through exactly the same validation. */
  apply: Record<Operation, RequestHandler>;
  /** The fields an approver sees, in order. */
  fields: ApprovalField[];
}

const HANDLERS: Record<ApprovalEntityType, ApprovalHandler> = {
  'checklist-question': {
    moduleKey: 'qms.checklist',
    label: (payload, before) => String(payload?.item || before?.item || 'Checklist question'),
    loadCurrent: async (id) => ChecklistQuestion.findById(id).lean() as any,
    apply: { create: createChecklistQuestion, update: updateChecklistQuestion, delete: deleteChecklistQuestion },
    fields: [
      { key: 'item', label: 'Item' },
      { key: 'description', label: 'Description' },
      { key: 'qCategory', label: 'Category', empty: 'General' },
      { key: 'vesselCode', label: 'Vessel code', empty: 'All' },
      { key: 'additionalFields', label: 'Additional fields' },
      {
        key: 'surveyCategories', label: 'Survey types',
        ref: { model: SurveyType, select: 'code name', name: (d) => [d.code, d.name].filter(Boolean).join(' · ') },
      },
      {
        key: 'areaOfOperations', label: 'Areas of operation',
        ref: { model: AreaOfOperation, select: 'AreaCategory description', name: (d) => (d.AreaCategory ? `Area ${d.AreaCategory}` : d.description) },
      },
      {
        key: 'boatTypes', label: 'Vessel types',
        ref: { model: VesselType, select: 'group name', name: (d) => (/^group\s/i.test(d.group || '') ? `${d.group} · ${d.name}` : d.name || d.group) },
      },
    ],
  },
};

export interface ApprovalChange {
  key: string;
  label: string;
  /** Lists are compared item by item; text fields have one value each. */
  list: boolean;
  before: string[];
  after: string[];
  added: string[];
  removed: string[];
  changed: boolean;
  empty?: string;
}

const idText = (v: unknown): string =>
  v && typeof v === 'object' && '_id' in (v as any) ? String((v as any)._id) : String(v ?? '');

const toList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

/** Readable field-by-field changes for an approval, with referenced IDs replaced by names. */
export const describeChanges = async (approval: IApprovalRequest): Promise<ApprovalChange[]> => {
  const handler = HANDLERS[approval.entityType];
  if (!handler) return [];
  const before = (approval.before ?? {}) as Record<string, unknown>;
  const after = (approval.operation === 'delete' ? {} : approval.payload ?? {}) as Record<string, unknown>;

  const changes: ApprovalChange[] = [];
  for (const field of handler.fields) {
    const beforeRaw = approval.operation === 'create' ? [] : toList(before[field.key]);
    // An update that leaves a field out keeps the current value.
    const afterRaw = approval.operation === 'update' && !(field.key in after) ? beforeRaw : toList(after[field.key]);

    let name = (v: unknown) => String(v ?? '').trim();
    if (field.ref) {
      const ids = [...new Set([...beforeRaw, ...afterRaw].map(idText).filter((id) => mongoose.isValidObjectId(id)))];
      const docs = ids.length ? await field.ref.model.find({ _id: { $in: ids } }).select(field.ref.select).lean() : [];
      const names = new Map(docs.map((d: any) => [String(d._id), field.ref!.name(d)]));
      name = (v) => names.get(idText(v)) ?? '(deleted item)';
    }
    const b = beforeRaw.map(name).filter(Boolean);
    const a = afterRaw.map(name).filter(Boolean);
    const added = a.filter((x) => !b.includes(x));
    const removed = b.filter((x) => !a.includes(x));
    const list = Array.isArray(before[field.key]) || Array.isArray(after[field.key]) || !!field.ref;
    changes.push({
      key: field.key, label: field.label, list, before: b, after: a, added, removed,
      changed: added.length > 0 || removed.length > 0 || (!list && b.join() !== a.join()),
      empty: field.empty,
    });
  }
  return changes;
};

const withChanges = async (approval: IApprovalRequest | null) =>
  approval ? { ...approval.toObject(), changes: await describeChanges(approval) } : null;

const isEntityType = (v: unknown): v is ApprovalEntityType =>
  typeof v === 'string' && (APPROVAL_ENTITY_TYPES as readonly string[]).includes(v);

/** `status` may be one status or a comma-separated list ("pending,approved"). */
const statusFilter = (v: unknown) => {
  if (typeof v !== 'string' || !v) return undefined;
  const list = v.split(',').map((x) => x.trim()).filter((x) => (APPROVAL_STATUSES as readonly string[]).includes(x));
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : { $in: list };
};

const commentOf = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const nameOf = async (userId?: string) => {
  if (!userId) return '';
  const u = await User.findById(userId).select('fullName username').lean();
  return u?.fullName || u?.username || '';
};

/** Runs an existing controller and captures its response instead of sending it. */
const invoke = (handler: RequestHandler, req: Request, body: unknown, params: Record<string, string>) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    let status = 200;
    // Express 5 makes req.query a getter, so plain assignment throws; define the fields instead.
    const fakeReq = Object.create(req, {
      body: { value: body, writable: true, enumerable: true },
      params: { value: params, writable: true, enumerable: true },
      query: { value: {}, writable: true, enumerable: true },
    });
    const fakeRes: any = {
      status(code: number) {
        status = code;
        return fakeRes;
      },
      json(payload: unknown) {
        resolve({ status, body: payload });
        return fakeRes;
      },
    };
    Promise.resolve(handler(fakeReq, fakeRes, reject)).catch(reject);
  });

/** Propose a change. Every change goes through approval and then acceptance, whoever raises it. */
export const createApprovalRequest = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  try {
    const { entityType, entityId, operation, payload } = req.body ?? {};
    const requestComment = commentOf(req.body?.requestComment);
    if (!isEntityType(entityType)) {
      res.status(400).json({ success: false, message: 'Unknown record type.' });
      return;
    }
    if (!['create', 'update', 'delete'].includes(operation)) {
      res.status(400).json({ success: false, message: 'Operation must be create, update or delete.' });
      return;
    }
    if (!requestComment) {
      res.status(400).json({ success: false, message: 'Add a request comment explaining the change.' });
      return;
    }
    const handler = HANDLERS[entityType];
    if (await rejectUnlessCan(authReq, res, handler.moduleKey, operation)) return;

    let before: Record<string, unknown> | null = null;
    if (operation !== 'create') {
      if (!mongoose.isValidObjectId(entityId)) {
        res.status(400).json({ success: false, message: 'Invalid record ID.' });
        return;
      }
      before = await handler.loadCurrent(entityId);
      if (!before) {
        res.status(404).json({ success: false, message: 'Record not found.' });
        return;
      }
      const open = await ApprovalRequest.exists({ entityType, entityId, status: { $in: OPEN_STATUSES } });
      if (open) {
        res.status(409).json({ success: false, message: 'This record already has a change waiting for approval or acceptance.' });
        return;
      }
    }

    const requestedByName = await nameOf(userId);
    const approval = await ApprovalRequest.create({
      entityType,
      entityId: operation === 'create' ? undefined : entityId,
      operation,
      summary: handler.label(payload, before),
      payload: payload ?? {},
      before,
      requestComment,
      requestedBy: userId,
      requestedByName,
      history: [{ action: 'submitted', by: userId, byName: requestedByName, at: new Date(), comment: requestComment }],
    });

    res.status(201).json({ success: true, message: 'Change sent for approval.', data: approval });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error submitting the change.', error: error.message });
  }
};

/** Revision the accepted change gives the record: 0 for a new record, then 1, 2, … for each later change. */
const nextRevision = async (approval: IApprovalRequest, entityId: unknown): Promise<number> => {
  if (approval.operation === 'create') return 0;
  const previous = await ApprovalRequest.find({
    entityType: approval.entityType,
    status: 'accepted',
    _id: { $ne: approval._id },
    $or: [{ entityId }, { resultId: entityId }],
    // When renumbering old records, only count changes that took effect earlier.
    ...(approval.effectiveDate ? { effectiveDate: { $lt: approval.effectiveDate } } : {}),
  }).select('revision operation').lean();
  const known = previous.map((p) => p.revision).filter((r): r is number => typeof r === 'number');
  // Records that existed before QMS change control count as revision 0.
  const latest = known.length ? Math.max(...known) : previous.filter((p) => p.operation !== 'create').length;
  return latest + 1;
};

/** Level 2: apply the approved change to the live record and mark it accepted. */
const applyAcceptance = async (
  req: Request,
  approval: IApprovalRequest,
  userId: string | undefined,
  comment: string
): Promise<{ ok: boolean; status: number; message?: string }> => {
  const handler = HANDLERS[approval.entityType];
  const params: Record<string, string> = approval.entityId ? { id: String(approval.entityId) } : {};
  const result = await invoke(handler.apply[approval.operation], req, approval.payload, params);
  if (result.status >= 400) {
    return { ok: false, status: result.status, message: result.body?.message || 'The change could not be applied.' };
  }
  const resultId = approval.operation === 'create' ? result.body?.data?._id : undefined;
  const entityId = approval.entityId ?? resultId;
  const revision = await nextRevision(approval, entityId);
  const now = new Date();
  const byName = await nameOf(userId);
  await ApprovalRequest.findOneAndUpdate(
    { _id: approval._id, status: 'approved' },
    {
      $set: {
        status: 'accepted',
        acceptedBy: userId,
        acceptedByName: byName,
        acceptanceComment: comment || undefined,
        effectiveDate: now,
        revision,
        resultId,
        entityId,
      },
      $push: { history: { action: 'accepted', by: userId, byName, at: now, comment: comment || undefined } },
    },
    { audit: { action: 'approval-request.accept', reason: comment || undefined } } as any
  );
  return { ok: true, status: 200 };
};

export const getApprovalRequests = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  try {
    const filter: Record<string, unknown> = {};
    const status = statusFilter(req.query.status);
    if (status) filter.status = status;
    if (isEntityType(req.query.entityType)) filter.entityType = req.query.entityType;
    if (req.query.entityId && mongoose.isValidObjectId(req.query.entityId)) filter.entityId = req.query.entityId;
    // Without approvals access a user only sees the changes they proposed.
    if (!(await userCanAny(authReq, ['approvals'], ['read', 'approve', 'accept']))) filter.requestedBy = authReq.user?.id;
    const result = await paginate(ApprovalRequest, filter, req);
    res.status(200).json({ ...result, data: await Promise.all(result.data.map((a) => withChanges(a))) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading approvals.', error: error.message });
  }
};

/**
 * QMS revision history: every change request in QMS in every state, newest activity first.
 * Readable by anyone with QMS or Approvals access.
 */
export const getRevisionHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];
    const status = statusFilter(req.query.status);
    if (status) filter.status = status;
    if (isEntityType(req.query.entityType)) filter.entityType = req.query.entityType;
    if (req.query.entityId && mongoose.isValidObjectId(req.query.entityId)) {
      and.push({ $or: [{ entityId: req.query.entityId }, { resultId: req.query.entityId }] });
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({ $or: [{ summary: rx }, { requestComment: rx }, { requestedByName: rx }, { approvedByName: rx }, { acceptedByName: rx }] });
    }
    if (and.length) filter.$and = and;
    const result = await paginate(ApprovalRequest, filter, req, [], { updatedAt: -1 });
    res.status(200).json({ ...result, data: await Promise.all(result.data.map((a) => withChanges(a))) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading the revision history.', error: error.message });
  }
};

const loadForDecision = async (req: Request, res: Response): Promise<IApprovalRequest | null> => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid approval ID.' });
    return null;
  }
  const approval = await ApprovalRequest.findById(req.params.id);
  if (!approval) {
    res.status(404).json({ success: false, message: 'Change request not found.' });
    return null;
  }
  return approval;
};

const reject = async (approval: IApprovalRequest, stage: 'approval' | 'acceptance', userId: string | undefined, comment: string) => {
  const now = new Date();
  const byName = await nameOf(userId);
  await ApprovalRequest.findOneAndUpdate(
    { _id: approval._id, status: approval.status },
    {
      $set: { status: 'rejected', rejectedStage: stage, rejectedBy: userId, rejectedByName: byName, rejectedAt: now, rejectionComment: comment },
      $push: { history: { action: 'rejected', stage, by: userId, byName, at: now, comment } },
    },
    { audit: { action: 'approval-request.reject', reason: comment } } as any
  );
};

/** Level 1: approve (sets the request date) or reject a pending change. Nothing is applied yet. */
export const decideApprovalRequest = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  try {
    const approval = await loadForDecision(req, res);
    if (!approval) return;
    if (approval.status !== 'pending') {
      res.status(409).json({ success: false, message: 'This change is no longer waiting for approval.' });
      return;
    }
    const decision = req.body?.decision;
    const comment = commentOf(req.body?.comment ?? req.body?.reason);
    if (decision === 'reject') {
      if (!comment) {
        res.status(400).json({ success: false, message: 'Add a comment explaining the rejection.' });
        return;
      }
      await reject(approval, 'approval', userId, comment);
      res.status(200).json({ success: true, message: 'Change rejected.', data: await ApprovalRequest.findById(approval._id) });
      return;
    }
    if (decision !== 'approve') {
      res.status(400).json({ success: false, message: 'Decision must be approve or reject.' });
      return;
    }
    const now = new Date();
    const byName = await nameOf(userId);
    await ApprovalRequest.findOneAndUpdate(
      { _id: approval._id, status: 'pending' },
      {
        $set: { status: 'approved', approvedBy: userId, approvedByName: byName, approvalComment: comment || undefined, requestDate: now },
        $push: { history: { action: 'approved', by: userId, byName, at: now, comment: comment || undefined } },
      },
      { audit: { action: 'approval-request.approve', reason: comment || undefined } } as any
    );
    res.status(200).json({ success: true, message: 'Change approved. It now needs to be accepted.', data: await ApprovalRequest.findById(approval._id) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deciding the approval.', error: error.message });
  }
};

/** Level 2: accept (applies the change, sets the effective date) or reject an approved change. */
export const acceptApprovalRequest = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  try {
    const approval = await loadForDecision(req, res);
    if (!approval) return;
    if (approval.status === 'pending') {
      res.status(409).json({ success: false, message: 'This change must be approved before it can be accepted.' });
      return;
    }
    if (approval.status !== 'approved') {
      res.status(409).json({ success: false, message: 'This change is no longer waiting for acceptance.' });
      return;
    }
    const decision = req.body?.decision;
    const comment = commentOf(req.body?.comment);
    if (decision === 'reject') {
      if (!comment) {
        res.status(400).json({ success: false, message: 'Add a comment explaining the rejection.' });
        return;
      }
      await reject(approval, 'acceptance', userId, comment);
      res.status(200).json({ success: true, message: 'Change rejected.', data: await ApprovalRequest.findById(approval._id) });
      return;
    }
    if (decision !== 'accept') {
      res.status(400).json({ success: false, message: 'Decision must be accept or reject.' });
      return;
    }
    const result = await applyAcceptance(req, approval, userId, comment);
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    res.status(200).json({ success: true, message: 'Change accepted and now in effect.', data: await ApprovalRequest.findById(approval._id) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error accepting the change.', error: error.message });
  }
};

/**
 * One-off startup migration from single-level approvals: old "approved" requests were applied on
 * approval, so they become "accepted" (request and effective date = the old decision date), and
 * every old request gets a history. Writes go straight to the collection so the audit log isn't flooded.
 */
export const migrateLegacyApprovals = async (): Promise<void> => {
  try {
    const legacy = await ApprovalRequest.collection
      .find({ $or: [{ history: { $exists: false } }, { history: { $size: 0 } }] })
      .toArray();
    for (const doc of legacy as any[]) {
      const history: any[] = [{ action: 'submitted', by: doc.requestedBy, byName: doc.requestedByName, at: doc.createdAt }];
      const set: Record<string, unknown> = {};
      if (doc.status === 'approved' && doc.reviewedAt && !doc.requestDate) {
        Object.assign(set, {
          status: 'accepted',
          approvedBy: doc.reviewedBy, approvedByName: doc.reviewedByName, approvalComment: doc.reason, requestDate: doc.reviewedAt,
          acceptedBy: doc.reviewedBy, acceptedByName: doc.reviewedByName, effectiveDate: doc.reviewedAt,
          entityId: doc.entityId ?? doc.resultId,
        });
        history.push(
          { action: 'approved', by: doc.reviewedBy, byName: doc.reviewedByName, at: doc.reviewedAt, comment: doc.reason },
          { action: 'accepted', by: doc.reviewedBy, byName: doc.reviewedByName, at: doc.reviewedAt },
        );
      } else if (doc.status === 'rejected' && !doc.rejectedStage) {
        Object.assign(set, {
          rejectedStage: 'approval', rejectedBy: doc.reviewedBy, rejectedByName: doc.reviewedByName,
          rejectedAt: doc.reviewedAt, rejectionComment: doc.reason,
        });
        history.push({ action: 'rejected', stage: 'approval', by: doc.reviewedBy, byName: doc.reviewedByName, at: doc.reviewedAt, comment: doc.reason });
      }
      set.history = history;
      await ApprovalRequest.collection.updateOne({ _id: doc._id }, { $set: set });
    }

    // Number the revisions of migrated records in order of their effective date.
    const unnumbered = await ApprovalRequest.find({ status: 'accepted', revision: { $exists: false } }).sort({ effectiveDate: 1 });
    for (const a of unnumbered) {
      const revision = await nextRevision(a, a.entityId ?? a.resultId);
      await ApprovalRequest.collection.updateOne({ _id: a._id }, { $set: { revision } });
    }
    if (legacy.length) console.log(`✅ QMS approvals: migrated ${legacy.length} request(s) to two-level sign-off.`);
  } catch (error) {
    console.error('❌ QMS approvals migration failed:', error);
  }
};
