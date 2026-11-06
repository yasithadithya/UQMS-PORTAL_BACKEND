import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin } from '../plugins/auditPlugin';

/**
 * V2 QMS change requests: a proposed create / update / delete of a controlled record (checklist
 * questions now; forms, SOPs and JDs later). Two levels of sign-off:
 *
 *   pending  --approve-->  approved  --accept-->  accepted   (change applied here)
 *      \--reject-->  rejected          \--reject-->  rejected
 *
 * Approving sets the request date; accepting applies the change and sets the effective date.
 * Every step is kept in `history`, which is the QMS revision history.
 */
export const APPROVAL_ENTITY_TYPES = ['checklist-question'] as const;
export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'accepted', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Statuses that still need someone to act (a record can have only one open change). */
export const OPEN_STATUSES: ApprovalStatus[] = ['pending', 'approved'];

export type HistoryAction = 'submitted' | 'approved' | 'accepted' | 'rejected';

export interface IApprovalHistoryEntry {
  action: HistoryAction;
  /** For rejections: which level rejected it. */
  stage?: 'approval' | 'acceptance';
  by?: mongoose.Types.ObjectId;
  byName?: string;
  at: Date;
  comment?: string;
}

export interface IApprovalRequest extends Document {
  entityType: ApprovalEntityType;
  entityId?: mongoose.Types.ObjectId;
  operation: 'create' | 'update' | 'delete';
  summary: string;
  payload: Record<string, unknown>;
  /** The record as it was when the change was proposed (for the diff view). */
  before?: Record<string, unknown> | null;
  status: ApprovalStatus;
  /** Why the change is being requested. */
  requestComment?: string;
  requestedBy: mongoose.Types.ObjectId;
  requestedByName?: string;

  // Level 1: approval
  approvedBy?: mongoose.Types.ObjectId;
  approvedByName?: string;
  approvalComment?: string;
  /** Date of approval. */
  requestDate?: Date;

  // Level 2: acceptance
  acceptedBy?: mongoose.Types.ObjectId;
  acceptedByName?: string;
  acceptanceComment?: string;
  /** Date of acceptance: the change takes effect from here. */
  effectiveDate?: Date;

  // Rejection (at either level)
  rejectedStage?: 'approval' | 'acceptance';
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedByName?: string;
  rejectedAt?: Date;
  rejectionComment?: string;

  /** Revision of the record this change produced (0 = first issue). Set on acceptance. */
  revision?: number;
  history: IApprovalHistoryEntry[];

  /** @deprecated single-level fields from before two-level sign-off; kept for old records. */
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  reason?: string;

  /** Id of the record the approval created (operation = create). */
  resultId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const historySchema = new Schema(
  {
    action: { type: String, enum: ['submitted', 'approved', 'accepted', 'rejected'], required: true },
    stage: { type: String, enum: ['approval', 'acceptance'] },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    comment: { type: String, trim: true },
  },
  { _id: false }
);

const approvalRequestSchema = new Schema(
  {
    entityType: { type: String, enum: APPROVAL_ENTITY_TYPES, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId },
    operation: { type: String, enum: ['create', 'update', 'delete'], required: true },
    summary: { type: String, trim: true, default: '' },
    payload: { type: Schema.Types.Mixed, default: {} },
    before: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: APPROVAL_STATUSES, default: 'pending', index: true },
    requestComment: { type: String, trim: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, trim: true },

    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String, trim: true },
    approvalComment: { type: String, trim: true },
    requestDate: { type: Date },

    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedByName: { type: String, trim: true },
    acceptanceComment: { type: String, trim: true },
    effectiveDate: { type: Date },

    rejectedStage: { type: String, enum: ['approval', 'acceptance'] },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedByName: { type: String, trim: true },
    rejectedAt: { type: Date },
    rejectionComment: { type: String, trim: true },

    revision: { type: Number },
    history: { type: [historySchema], default: [] },

    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String, trim: true },
    reviewedAt: { type: Date },
    reason: { type: String, trim: true },
    resultId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

approvalRequestSchema.index({ entityType: 1, entityId: 1, status: 1 });

approvalRequestSchema.plugin(auditPlugin, { entityType: 'approval-request' });

const ApprovalRequest = mongoose.model<IApprovalRequest>('ApprovalRequest', approvalRequestSchema);

export default ApprovalRequest;
