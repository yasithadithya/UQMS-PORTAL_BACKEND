import mongoose from 'mongoose';
import AuditLog, { IAuditChange } from '../models/AuditLog';
import type { AuthRequest } from '../middleware/auth';
import { roleNameOf } from '../utils/permissions';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: unknown;
  entityRef?: string;
  reason?: string;
  changes?: IAuditChange[];
}

const toComparable = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

/** Field-level diff of `fields` between the record before and after a change. */
export const diffFields = (before: Record<string, any>, after: Record<string, any>, fields: string[]): IAuditChange[] =>
  fields
    .filter((field) => toComparable(before?.[field]) !== toComparable(after?.[field]))
    .map((field) => ({ field, from: before?.[field], to: after?.[field] }));

/**
 * Writes an audit entry for the current user. Failures are logged rather than thrown so an audit
 * hiccup never undoes a change that has already been saved.
 */
export const recordAudit = async (req: AuthRequest, entry: AuditEntry): Promise<void> => {
  try {
    const entityId = entry.entityId && mongoose.isValidObjectId(String(entry.entityId)) ? String(entry.entityId) : undefined;
    await AuditLog.create({
      ...entry,
      entityId,
      user: req.user?.id && mongoose.isValidObjectId(req.user.id) ? req.user.id : undefined,
      userEmail: req.user?.email,
      roleName: roleNameOf(req.user?.role) || undefined,
      changes: entry.changes ?? [],
    });
  } catch (error) {
    console.error(`❌ Failed to write audit log (${entry.action}):`, error);
  }
};
