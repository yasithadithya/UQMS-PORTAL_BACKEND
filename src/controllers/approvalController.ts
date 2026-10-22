import { Request, Response, RequestHandler } from 'express';
import mongoose from 'mongoose';
import ApprovalRequest, { APPROVAL_ENTITY_TYPES, ApprovalEntityType, IApprovalRequest } from '../models/ApprovalRequest';
import ChecklistQuestion from '../models/ChecklistQuestion';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { rejectUnlessCan } from '../middleware/permission';
import { userCan } from '../utils/permissions';
import { paginate } from '../utils/pagination';
import {
  createChecklistQuestion,
  deleteChecklistQuestion,
  updateChecklistQuestion,
} from './checklistQuestionController';

type Operation = IApprovalRequest['operation'];

interface ApprovalHandler {
  /** Permission module whose create/update/delete action is needed to propose a change. */
  moduleKey: string;
  label: (payload: any, before: any) => string;
  loadCurrent: (id: string) => Promise<Record<string, unknown> | null>;
  /** The existing controllers, so approved changes go through exactly the same validation. */
  apply: Record<Operation, RequestHandler>;
}

const HANDLERS: Record<ApprovalEntityType, ApprovalHandler> = {
  'checklist-question': {
    moduleKey: 'qms.checklist',
    label: (payload, before) => String(payload?.item || before?.item || 'Checklist question'),
    loadCurrent: async (id) => ChecklistQuestion.findById(id).lean() as any,
    apply: { create: createChecklistQuestion, update: updateChecklistQuestion, delete: deleteChecklistQuestion },
  },
};

const isEntityType = (v: unknown): v is ApprovalEntityType =>
  typeof v === 'string' && (APPROVAL_ENTITY_TYPES as readonly string[]).includes(v);

const nameOf = async (userId?: string) => {
  if (!userId) return '';
  const u = await User.findById(userId).select('fullName username').lean();
  return u?.fullName || u?.username || '';
};

/** Runs an existing controller and captures its response instead of sending it. */
const invoke = (handler: RequestHandler, req: Request, body: unknown, params: Record<string, string>) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    let status = 200;
    const fakeReq = Object.assign(Object.create(req), { body, params, query: {} });
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

/** Propose a change. Approvers' own changes are applied straight away and recorded as approved. */
export const createApprovalRequest = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  try {
    const { entityType, entityId, operation, payload } = req.body ?? {};
    if (!isEntityType(entityType)) {
      res.status(400).json({ success: false, message: 'Unknown record type.' });
      return;
    }
    if (!['create', 'update', 'delete'].includes(operation)) {
      res.status(400).json({ success: false, message: 'Operation must be create, update or delete.' });
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
      const pending = await ApprovalRequest.exists({ entityType, entityId, status: 'pending' });
      if (pending) {
        res.status(409).json({ success: false, message: 'This record already has a change waiting for approval.' });
        return;
      }
    }

    const approval = await ApprovalRequest.create({
      entityType,
      entityId: operation === 'create' ? undefined : entityId,
      operation,
      summary: handler.label(payload, before),
      payload: payload ?? {},
      before,
      requestedBy: userId,
      requestedByName: await nameOf(userId),
    });

    if (await userCan(authReq, 'approvals', 'approve')) {
      const result = await applyApproval(req, approval, userId, 'Applied directly by an approver.');
      res.status(result.ok ? 201 : result.status).json({
        success: result.ok,
        message: result.ok ? 'Change applied.' : result.message,
        data: await ApprovalRequest.findById(approval._id),
      });
      return;
    }

    res.status(201).json({ success: true, message: 'Change sent for approval.', data: approval });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error submitting the change.', error: error.message });
  }
};

const applyApproval = async (
  req: Request,
  approval: IApprovalRequest,
  reviewerId: string | undefined,
  reason?: string
): Promise<{ ok: boolean; status: number; message?: string }> => {
  const handler = HANDLERS[approval.entityType];
  const params: Record<string, string> = approval.entityId ? { id: String(approval.entityId) } : {};
  const result = await invoke(handler.apply[approval.operation], req, approval.payload, params);
  if (result.status >= 400) {
    return { ok: false, status: result.status, message: result.body?.message || 'The change could not be applied.' };
  }
  const resultId = approval.operation === 'create' ? result.body?.data?._id : undefined;
  await ApprovalRequest.findOneAndUpdate(
    { _id: approval._id, status: 'pending' },
    {
      $set: { status: 'approved', reviewedBy: reviewerId, reviewedByName: await nameOf(reviewerId), reviewedAt: new Date(), reason, resultId },
    },
    { audit: { action: 'approval-request.approve', reason } } as any
  );
  return { ok: true, status: 200 };
};

export const getApprovalRequests = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  try {
    const filter: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status;
    if (isEntityType(req.query.entityType)) filter.entityType = req.query.entityType;
    if (req.query.entityId && mongoose.isValidObjectId(req.query.entityId)) filter.entityId = req.query.entityId;
    // Without approvals access a user only sees the changes they proposed.
    if (!(await userCan(authReq, 'approvals', 'read'))) filter.requestedBy = authReq.user?.id;
    const result = await paginate(ApprovalRequest, filter, req);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading approvals.', error: error.message });
  }
};

export const decideApprovalRequest = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid approval ID.' });
      return;
    }
    const approval = await ApprovalRequest.findById(req.params.id);
    if (!approval) {
      res.status(404).json({ success: false, message: 'Approval not found.' });
      return;
    }
    if (approval.status !== 'pending') {
      res.status(409).json({ success: false, message: 'This change has already been decided.' });
      return;
    }
    const decision = req.body?.decision;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (decision === 'reject') {
      if (!reason) {
        res.status(400).json({ success: false, message: 'Give a reason for rejecting.' });
        return;
      }
      await ApprovalRequest.findOneAndUpdate(
        { _id: approval._id, status: 'pending' },
        { $set: { status: 'rejected', reviewedBy: userId, reviewedByName: await nameOf(userId), reviewedAt: new Date(), reason } },
        { audit: { action: 'approval-request.reject', reason } } as any
      );
      res.status(200).json({ success: true, message: 'Change rejected.', data: await ApprovalRequest.findById(approval._id) });
      return;
    }
    if (decision !== 'approve') {
      res.status(400).json({ success: false, message: 'Decision must be approve or reject.' });
      return;
    }
    const result = await applyApproval(req, approval, userId, reason || undefined);
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    res.status(200).json({ success: true, message: 'Change approved and applied.', data: await ApprovalRequest.findById(approval._id) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deciding the approval.', error: error.message });
  }
};
