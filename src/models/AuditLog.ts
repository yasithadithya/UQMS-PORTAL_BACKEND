import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditChange {
  /** Dotted path of the changed value, e.g. 'lineItems[2].quantity'. */
  field: string;
  /** Human-readable name of the field, when the registry defines one. */
  label?: string;
  from?: unknown;
  to?: unknown;
}

export const AUDIT_OPERATIONS = [
  'create', 'update', 'delete', 'status', 'approve', 'revoke', 'sign', 'assign',
  'login', 'logout', 'view', 'download', 'print', 'email', 'upload', 'export', 'other',
] as const;
export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];

export const AUDIT_OUTCOMES = ['success', 'failure'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * Append-only record of everything that happens in the system: who did what, to which record,
 * when, from where, and which fields changed. Entries can never be edited or deleted.
 */
export interface IAuditLog extends Document {
  /** What happened, e.g. 'user.create', 'request.update.override', 'quotation.discount'. */
  action: string;
  operation: AuditOperation;
  outcome: AuditOutcome;
  /** Permission module the record belongs to, e.g. 'admin.users', 'marine.bookings'. */
  module?: string;
  entityType: string;
  entityId?: mongoose.Types.ObjectId;
  /** Human-readable reference such as the request or quotation number. */
  entityRef?: string;
  /** One-line description shown in lists. */
  summary?: string;
  user?: mongoose.Types.ObjectId;
  userEmail?: string;
  userName?: string;
  roleName?: string;
  reason?: string;
  changes: IAuditChange[];
  /** Full (redacted) copy of the record, kept for creates and deletes. */
  snapshot?: unknown;
  /** Extra details: file names, email recipients, attempted login name, etc. */
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  method?: string;
  path?: string;
  createdAt: Date;
}

const auditLogSchema: Schema = new Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    operation: { type: String, enum: AUDIT_OPERATIONS, default: 'other' },
    outcome: { type: String, enum: AUDIT_OUTCOMES, default: 'success' },
    module: { type: String, trim: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    entityRef: { type: String, trim: true },
    summary: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    userEmail: { type: String, trim: true },
    userName: { type: String, trim: true },
    roleName: { type: String, trim: true },
    reason: { type: String, trim: true },
    changes: {
      type: [{
        _id: false,
        field: { type: String, required: true },
        label: String,
        from: Schema.Types.Mixed,
        to: Schema.Types.Mixed,
      }],
      default: [],
    },
    snapshot: Schema.Types.Mixed,
    metadata: Schema.Types.Mixed,
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    requestId: { type: String, trim: true },
    method: { type: String, trim: true },
    path: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ operation: 1, createdAt: -1 });
auditLogSchema.index({ outcome: 1, createdAt: -1 });

// The trail is append-only: refuse every update or delete issued through the model.
const immutable = function (this: unknown) {
  throw new Error('Audit log entries are immutable.');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  auditLogSchema.pre(op, immutable);
}
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('Audit log entries are immutable.'));
  next();
});

const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
