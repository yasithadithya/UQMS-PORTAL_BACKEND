import { Router, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import AuditLog, { AUDIT_OPERATIONS, AUDIT_OUTCOMES } from '../models/AuditLog';
import { paginate } from '../utils/pagination';
import { auditMeta } from '../config/auditRegistry';
import { audit } from '../services/auditService';

const router = Router();

router.use(authMiddleware);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Builds the Mongo filter from query parameters, or returns an error message. */
const buildFilter = (q: AuthRequest['query']): { filter: Record<string, unknown> } | { error: string } => {
  const filter: Record<string, unknown> = {};
  for (const key of ['entityType', 'action', 'module'] as const) {
    if (str(q[key])) filter[key] = str(q[key]);
  }
  if (str(q.operation)) {
    if (!(AUDIT_OPERATIONS as readonly string[]).includes(str(q.operation))) return { error: 'Invalid operation.' };
    filter.operation = str(q.operation);
  }
  if (str(q.outcome)) {
    if (!(AUDIT_OUTCOMES as readonly string[]).includes(str(q.outcome))) return { error: 'Invalid outcome.' };
    filter.outcome = str(q.outcome);
  }
  for (const key of ['entityId', 'user'] as const) {
    if (!str(q[key])) continue;
    if (!mongoose.isValidObjectId(str(q[key]))) return { error: `Invalid ${key}.` };
    filter[key] = str(q[key]);
  }
  const range: Record<string, Date> = {};
  if (str(q.from)) {
    const from = new Date(str(q.from));
    if (isNaN(from.getTime())) return { error: 'Invalid from date.' };
    range.$gte = from;
  }
  if (str(q.to)) {
    const to = new Date(str(q.to));
    if (isNaN(to.getTime())) return { error: 'Invalid to date.' };
    // A bare date means "through the end of that day".
    if (/^\d{4}-\d{2}-\d{2}$/.test(str(q.to))) to.setUTCHours(23, 59, 59, 999);
    range.$lte = to;
  }
  if (Object.keys(range).length) filter.createdAt = range;
  if (str(q.q)) {
    const re = new RegExp(escapeRegex(str(q.q).slice(0, 100)), 'i');
    filter.$or = [{ entityRef: re }, { summary: re }, { userEmail: re }, { userName: re }, { reason: re }, { ip: re }];
  }
  return { filter };
};

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: List audit log entries (newest first)
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: module, schema: { type: string } }
 *       - { in: query, name: entityType, schema: { type: string } }
 *       - { in: query, name: entityId, schema: { type: string } }
 *       - { in: query, name: action, schema: { type: string } }
 *       - { in: query, name: operation, schema: { type: string } }
 *       - { in: query, name: outcome, schema: { type: string, enum: [success, failure] } }
 *       - { in: query, name: user, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: q, description: Search reference, summary, user, reason or IP, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Paginated audit entries
 */
router.get('/', requirePermission('admin.audit-log', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const built = buildFilter(req.query);
    if ('error' in built) {
      res.status(400).json({ success: false, message: built.error });
      return;
    }
    // Snapshots can be large; they are only sent with a single entry.
    const result = await paginate(AuditLog, built.filter, req, [{ path: 'user', select: 'username fullName email' }]);
    result.data = result.data.map((d: any) => {
      const o = d.toObject();
      o.hasSnapshot = o.snapshot !== undefined && o.snapshot !== null;
      delete o.snapshot;
      return o;
    }) as any;
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching audit log.', error: error.message });
  }
});

/**
 * @swagger
 * /api/audit-logs/meta:
 *   get:
 *     summary: Labels for record types, actions and operations
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
 */
router.get('/meta', requirePermission('admin.audit-log', 'read'), async (_req: AuthRequest, res: Response) => {
  try {
    const meta = auditMeta();
    // Include actions that exist in the data but aren't registered (e.g. retired ones).
    const used: string[] = await AuditLog.distinct('action');
    for (const a of used) if (!meta.actions[a]) meta.actions[a] = { label: a, operation: 'other' };
    const users = await AuditLog.aggregate([
      { $match: { user: { $ne: null } } },
      { $group: { _id: '$user', name: { $last: '$userName' }, email: { $last: '$userEmail' } } },
      { $sort: { name: 1 } },
      { $limit: 1000 },
    ]);
    res.status(200).json({
      success: true,
      data: { ...meta, operations: AUDIT_OPERATIONS, users: users.map((u) => ({ _id: u._id, name: u.name || u.email, email: u.email })) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching audit log metadata.', error: error.message });
  }
});

const csvCell = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  let s = v instanceof Date ? v.toISOString()
    : typeof v === 'object' && !(v as any)._bsontype ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csvValue = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return '—';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
};

const EXPORT_LIMIT = 50000;

/**
 * @swagger
 * /api/audit-logs/export:
 *   get:
 *     summary: Download matching audit entries as CSV (same filters as the list)
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
 */
router.get('/export', requirePermission('admin.audit-log', 'export'), async (req: AuthRequest, res: Response) => {
  try {
    const built = buildFilter(req.query);
    if ('error' in built) {
      res.status(400).json({ success: false, message: built.error });
      return;
    }
    const meta = auditMeta();
    const entries = await AuditLog.find(built.filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT).select('-snapshot').lean();

    const header = ['When (UTC)', 'User', 'Email', 'Role', 'Action', 'Operation', 'Outcome', 'Module', 'Record type', 'Record', 'Record ID', 'Summary', 'Changes', 'Reason', 'Details', 'IP', 'User agent', 'Request ID'];
    const lines = [header.join(',')];
    for (const e of entries as any[]) {
      const changes = (e.changes ?? [])
        .map((c: any) => `${c.label || c.field}: ${csvValue(c.from)} → ${csvValue(c.to)}`)
        .join('\n');
      lines.push([
        e.createdAt?.toISOString(), e.userName, e.userEmail, e.roleName,
        meta.actions[e.action]?.label ?? e.action, e.operation, e.outcome, e.module,
        meta.entities[e.entityType]?.label ?? e.entityType, e.entityRef, e.entityId, e.summary,
        changes, e.reason, e.metadata, e.ip, e.userAgent, e.requestId,
      ].map(csvCell).join(','));
    }

    await audit.event({
      action: 'audit.export',
      entityType: 'audit-log',
      metadata: { filters: req.query, rows: entries.length },
    }, req);

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.csv"`);
    res.status(200).send(`﻿${lines.join('\r\n')}`);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error exporting audit log.', error: error.message });
  }
});

/**
 * @swagger
 * /api/audit-logs/{id}:
 *   get:
 *     summary: One audit entry in full, including the record snapshot
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', requirePermission('admin.audit-log', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid id.' });
      return;
    }
    const entry = await AuditLog.findById(req.params.id).populate('user', 'username fullName email').lean();
    if (!entry) {
      res.status(404).json({ success: false, message: 'Audit entry not found.' });
      return;
    }
    res.status(200).json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching audit entry.', error: error.message });
  }
});

export default router;
