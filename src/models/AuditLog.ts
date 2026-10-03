import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

/** Append-only record of controlled changes (Technical Committee overrides, discounts, etc.). */
export interface IAuditLog extends Document {
  /** What happened, e.g. 'request.create.override', 'request.update.override', 'quotation.discount'. */
  action: string;
  entityType: string;
  entityId?: mongoose.Types.ObjectId;
  /** Human-readable reference such as the request or quotation number. */
  entityRef?: string;
  user?: mongoose.Types.ObjectId;
  userEmail?: string;
  roleName?: string;
  reason?: string;
  changes: IAuditChange[];
  createdAt: Date;
}

const auditLogSchema: Schema = new Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    entityRef: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    userEmail: { type: String, trim: true },
    roleName: { type: String, trim: true },
    reason: { type: String, trim: true },
    changes: {
      type: [{ _id: false, field: { type: String, required: true }, from: Schema.Types.Mixed, to: Schema.Types.Mixed }],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
