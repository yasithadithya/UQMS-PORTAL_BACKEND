import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin } from '../plugins/auditPlugin';

/**
 * V2 QMS approvals: a proposed create / update / delete of a controlled record (checklist questions
 * now; forms, SOPs and JDs later). Nothing changes until someone with `approvals:approve` approves it.
 */
export const APPROVAL_ENTITY_TYPES = ['checklist-question'] as const;
export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export interface IApprovalRequest extends Document {
  entityType: ApprovalEntityType;
  entityId?: mongoose.Types.ObjectId;
  operation: 'create' | 'update' | 'delete';
  summary: string;
  payload: Record<string, unknown>;
  /** The record as it was when the change was proposed (for the diff view). */
  before?: Record<string, unknown> | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: mongoose.Types.ObjectId;
  requestedByName?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  reason?: string;
  /** Id of the record the approval created (operation = create). */
  resultId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const approvalRequestSchema = new Schema(
  {
    entityType: { type: String, enum: APPROVAL_ENTITY_TYPES, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId },
    operation: { type: String, enum: ['create', 'update', 'delete'], required: true },
    summary: { type: String, trim: true, default: '' },
    payload: { type: Schema.Types.Mixed, default: {} },
    before: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, trim: true },
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
