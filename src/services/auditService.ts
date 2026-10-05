import mongoose from 'mongoose';
import AuditLog, { IAuditChange, AuditOperation, AuditOutcome } from '../models/AuditLog';
import type { AuthRequest } from '../middleware/auth';
import { getAuditContext } from '../middleware/requestContext';
import {
  AuditEntityConfig, DEFAULT_DISPLAY_REFS, DEFAULT_IGNORE, DEFAULT_REDACT, MODEL_NAME_FIELDS, actionInfo, getEntityConfig,
} from '../config/auditRegistry';

// Kept local (not imported from utils/permissions) so models can load the audit plugin without an import cycle.
const roleNameOf = (role: unknown): string => {
  const name = role && typeof role === 'object' ? (role as { roleName?: unknown }).roleName : role;
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
};

export interface AuditActor {
  id?: string;
  email?: string;
  name?: string;
  role?: unknown;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: unknown;
  entityRef?: string;
  reason?: string;
  changes?: IAuditChange[];
  summary?: string;
  metadata?: Record<string, unknown>;
  snapshot?: unknown;
  outcome?: AuditOutcome;
  operation?: AuditOperation;
  /** Who acted; defaults to the signed-in user of the current request. */
  actor?: AuditActor;
}

/** Extra details attached to an automatic (plugin) entry via `{ audit: {...} }` or `doc.$locals.audit`. */
export interface AuditTag {
  action?: string;
  reason?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export const REDACTED = '[redacted]';
const MAX_CHANGES = 300;
const MAX_STRING = 2000;
const MAX_SNAPSHOT_BYTES = 512 * 1024;

// ── Value helpers ──────────────────────────────────────────────────────────

const isObjectId = (v: unknown): boolean =>
  v instanceof mongoose.Types.ObjectId || (!!v && typeof v === 'object' && (v as any)._bsontype === 'ObjectId');

const isBinary = (v: unknown): boolean =>
  Buffer.isBuffer(v) || (!!v && typeof v === 'object' && (v as any)._bsontype === 'Binary');

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !isObjectId(v) && !isBinary(v) && !(v as any)._bsontype;

const toComparable = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  if (isObjectId(value)) return String(value);
  if (Array.isArray(value) && value.length === 0) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

const shortenString = (s: string): string => {
  if (s.length <= MAX_STRING) return s;
  if (s.startsWith('data:')) return `[embedded file, ${s.length} chars]`;
  return `${s.slice(0, MAX_STRING)}… [${s.length} chars]`;
};

/** Converts a value to plain, storable JSON: ids to strings, dates to ISO, large blobs shortened. */
const clean = (value: unknown, redact?: (key: string) => boolean, depth = 0): unknown => {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (isObjectId(value)) return String(value);
  if (isBinary(value)) return `[${(value as any).length ?? (value as any).buffer?.length ?? '?'} bytes]`;
  if (typeof value === 'string') return shortenString(value);
  if (typeof value !== 'object') return value;
  if ((value as any)._bsontype) return String(value);
  if (depth > 12) return '[…]';
  if (Array.isArray(value)) return value.map((v) => clean(v, redact, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === '__v') continue;
    out[k] = redact?.(k) && v !== undefined && v !== null && v !== '' ? REDACTED : clean(v, redact, depth + 1);
  }
  return out;
};

const toPlain = (doc: unknown): Record<string, any> | undefined => {
  if (!doc) return undefined;
  if (typeof (doc as any).toObject === 'function') return (doc as any).toObject({ depopulate: true, virtuals: false });
  return doc as Record<string, any>;
};

// ── Diff ───────────────────────────────────────────────────────────────────

interface DiffSettings {
  ignore: Set<string>;
  isRedacted: (key: string) => boolean;
  arrayKeys: Record<string, string>;
}

const settingsFor = (cfg: AuditEntityConfig): DiffSettings => {
  const redact = [...DEFAULT_REDACT, ...(cfg.redact ?? [])].map((r) => r.toLowerCase());
  return {
    ignore: new Set([...DEFAULT_IGNORE.filter((f) => !cfg.track?.includes(f)), ...(cfg.ignore ?? [])]),
    isRedacted: (key) => redact.some((r) => key.toLowerCase() === r || (r.length > 5 && key.toLowerCase().includes(r))),
    arrayKeys: cfg.arrayKeys ?? {},
  };
};

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

const diffValue = (before: unknown, after: unknown, path: string, key: string | undefined, s: DiffSettings, out: IAuditChange[]): void => {
  if (out.length >= MAX_CHANGES) return;
  if (key && s.ignore.has(key)) return;
  if (key && s.isRedacted(key)) {
    if (toComparable(before) !== toComparable(after)) {
      out.push({ field: path, from: toComparable(before) ? REDACTED : undefined, to: toComparable(after) ? REDACTED : undefined });
    }
    return;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    diffArray(before, after, path, key, s, out);
    return;
  }
  const bObj = isPlainObject(before);
  const aObj = isPlainObject(after);
  if ((bObj || before == null) && (aObj || after == null) && (bObj || aObj)) {
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    for (const k of keys) diffValue((before as any)?.[k], (after as any)?.[k], join(path, k), k, s, out);
    return;
  }
  if (toComparable(before) !== toComparable(after)) {
    out.push({ field: path, from: clean(before, s.isRedacted), to: clean(after, s.isRedacted) });
  }
};

const diffArray = (rawBefore: unknown, rawAfter: unknown, path: string, key: string | undefined, s: DiffSettings, out: IAuditChange[]): void => {
  const before = Array.isArray(rawBefore) ? rawBefore : [];
  const after = Array.isArray(rawAfter) ? rawAfter : [];
  const hasObjects = [...before, ...after].some(isPlainObject);
  if (!hasObjects) {
    if (toComparable(rawBefore) !== toComparable(rawAfter)) {
      out.push({ field: path, from: clean(rawBefore, s.isRedacted), to: clean(rawAfter, s.isRedacted) });
    }
    return;
  }

  const customKey = key ? s.arrayKeys[key] : undefined;
  const idKey = customKey ?? ([...before, ...after].every((i) => isPlainObject(i) && i._id != null) ? '_id' : undefined);

  if (!idKey) {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i++) diffValue(before[i], after[i], `${path}[${i}]`, undefined, s, out);
    return;
  }

  // Match items by identity so a reorder or an insertion doesn't show up as every item changing.
  const idOf = (item: unknown) => toComparable((item as any)?.[idKey]);
  const segment = (item: unknown, index: number) => (customKey ? `{{${customKey}:${idOf(item)}}}` : String(index));
  const beforeById = new Map(before.map((item) => [idOf(item), item]));
  const seen = new Set<string>();
  after.forEach((item, i) => {
    const id = idOf(item);
    seen.add(id);
    diffValue(beforeById.get(id), item, `${path}[${segment(item, i)}]`, undefined, s, out);
  });
  before.forEach((item, i) => {
    if (!seen.has(idOf(item))) diffValue(item, undefined, `${path}[${segment(item, i)}]`, undefined, s, out);
  });
};

/**
 * Deep, field-level diff between two versions of a record. Nested objects and arrays are followed
 * so changes come out as paths such as `lineItems[2].quantity` or `permissions[Users].actions`.
 */
export const deepDiff = (before: unknown, after: unknown, entityType: string): IAuditChange[] => {
  const out: IAuditChange[] = [];
  diffValue(toPlain(before), toPlain(after), '', undefined, settingsFor(getEntityConfig(entityType)), out);
  return out;
};

/** Field-level diff of `fields` between the record before and after a change. */
export const diffFields = (before: Record<string, any>, after: Record<string, any>, fields: string[]): IAuditChange[] =>
  fields
    .filter((field) => toComparable(before?.[field]) !== toComparable(after?.[field]))
    .map((field) => ({ field, from: before?.[field], to: after?.[field] }));

// ── Display names for referenced records ───────────────────────────────────

const lastKey = (path: string) => path.replace(/\[[^\]]*\]/g, '').split('.').pop() ?? '';
const normalisePath = (path: string) => path.replace(/\[[^\]]*\]/g, '');
const TOKEN = /\{\{([^:}]+):([^}]*)\}\}/g;

const lookupNames = async (modelName: string, ids: string[]): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  const valid = ids.filter((id) => mongoose.isValidObjectId(id));
  if (!valid.length || !mongoose.modelNames().includes(modelName)) return names;
  const fields = MODEL_NAME_FIELDS[modelName] ?? ['name'];
  const docs = await mongoose.model(modelName).find({ _id: { $in: valid } }).select(fields.join(' ')).lean();
  for (const doc of docs as any[]) {
    const name = fields.map((f) => doc[f]).find((v) => v !== undefined && v !== null && v !== '');
    if (name !== undefined) names.set(String(doc._id), String(name));
  }
  return names;
};

/** Replaces ObjectIds in `displayRefs` fields with readable names, and labels each change. */
const humanise = async (changes: IAuditChange[], cfg: AuditEntityConfig): Promise<IAuditChange[]> => {
  const refs: Record<string, string> = { ...DEFAULT_DISPLAY_REFS, ...(cfg.displayRefs ?? {}) };
  const wanted = new Map<string, Set<string>>();
  const want = (model: string | undefined, value: unknown) => {
    if (!model) return;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (typeof v === 'string' && mongoose.isValidObjectId(v)) {
        if (!wanted.has(model)) wanted.set(model, new Set());
        wanted.get(model)!.add(v);
      }
    }
  };
  for (const c of changes) {
    const model = refs[lastKey(c.field)];
    want(model, c.from);
    want(model, c.to);
    for (const [, key, id] of c.field.matchAll(TOKEN)) want(refs[key], id);
  }

  const names = new Map<string, Map<string, string>>();
  try {
    await Promise.all([...wanted].map(async ([model, ids]) => names.set(model, await lookupNames(model, [...ids]))));
  } catch (error) {
    console.error('❌ Audit log: could not resolve reference names:', error);
  }
  const nameOf = (model: string | undefined, v: unknown): unknown => {
    if (!model) return v;
    if (Array.isArray(v)) return v.map((x) => nameOf(model, x));
    return typeof v === 'string' ? names.get(model)?.get(v) ?? v : v;
  };

  return changes.map((c) => {
    const model = refs[lastKey(c.field)];
    const field = c.field.replace(TOKEN, (_m, key, id) => String(nameOf(refs[key], id)));
    const label = cfg.fieldLabels?.[normalisePath(c.field)] ?? cfg.fieldLabels?.[lastKey(c.field)];
    return { field, ...(label ? { label } : {}), from: nameOf(model, c.from), to: nameOf(model, c.to) };
  });
};

// ── Writing ────────────────────────────────────────────────────────────────

const userNameCache = new Map<string, { name: string; at: number }>();
const USER_NAME_TTL = 5 * 60 * 1000;

const userNameOf = async (id?: string): Promise<string | undefined> => {
  if (!id || !mongoose.isValidObjectId(id) || !mongoose.modelNames().includes('User')) return undefined;
  const cached = userNameCache.get(id);
  if (cached && Date.now() - cached.at < USER_NAME_TTL) return cached.name;
  const user: any = await mongoose.model('User').findById(id).select('fullName username email').lean();
  const name = user?.fullName || user?.username || user?.email;
  if (name) userNameCache.set(id, { name, at: Date.now() });
  return name;
};

/** The readable reference of a record (e.g. its quotation number), per the registry. */
export const refOf = (entityType: string, doc: unknown): string | undefined => {
  const plain = toPlain(doc);
  if (!plain) return undefined;
  const fields = getEntityConfig(entityType).refField;
  for (const f of Array.isArray(fields) ? fields : fields ? [fields] : []) {
    if (plain[f] !== undefined && plain[f] !== null && plain[f] !== '') return String(plain[f]);
  }
  return undefined;
};

/** Looks up a record's reference by id, for events that only know the id. */
const refById = async (entityType: string, id: string): Promise<string | undefined> => {
  const cfg = getEntityConfig(entityType);
  if (!cfg.model || !cfg.refField || !mongoose.modelNames().includes(cfg.model)) return undefined;
  const fields = Array.isArray(cfg.refField) ? cfg.refField : [cfg.refField];
  return refOf(entityType, await mongoose.model(cfg.model).findById(id).select(fields.join(' ')).lean());
};

/** Full redacted copy of a record, for creates and deletes. */
export const snapshotOf = (entityType: string, doc: unknown): unknown => {
  const plain = toPlain(doc);
  if (!plain) return undefined;
  const snap = clean(plain, settingsFor(getEntityConfig(entityType)).isRedacted);
  return JSON.stringify(snap).length > MAX_SNAPSHOT_BYTES ? { truncated: true, _id: String(plain._id ?? '') } : snap;
};

/**
 * Writes one audit entry. The actor, IP, user-agent and request id come from the request context
 * unless given. Failures are logged rather than thrown so an audit hiccup never undoes a change
 * that has already been saved.
 */
export const writeAudit = async (entry: AuditEntry, req?: AuthRequest): Promise<void> => {
  try {
    const ctx = getAuditContext();
    const tokenUser = req?.user ?? ctx?.user;
    const actor: AuditActor = entry.actor ?? (tokenUser ? { id: tokenUser.id, email: tokenUser.email, role: tokenUser.role } : {});
    const userId = actor.id && mongoose.isValidObjectId(actor.id) ? actor.id : undefined;
    const systemName = !userId && !actor.email ? `System (${ctx?.system ?? 'background'})` : undefined;

    const info = actionInfo(entry.action);
    const cfg = getEntityConfig(entry.entityType);
    const changes = entry.changes?.length ? await humanise(entry.changes, cfg) : [];
    const entityId = entry.entityId && mongoose.isValidObjectId(String(entry.entityId)) ? String(entry.entityId) : undefined;
    const entityRef = entry.entityRef ?? (entityId ? await refById(entry.entityType, entityId) : undefined);
    const summary = entry.summary
      ?? [info.label, entityRef].filter(Boolean).join(': ')
        + (changes.length && info.operation === 'update' ? ` (${changes.length} field${changes.length === 1 ? '' : 's'})` : '');

    await AuditLog.create({
      action: entry.action,
      operation: entry.operation ?? info.operation,
      outcome: entry.outcome ?? 'success',
      module: cfg.module || undefined,
      entityType: entry.entityType,
      entityId,
      entityRef,
      summary,
      user: userId,
      userEmail: actor.email,
      userName: actor.name ?? (await userNameOf(userId)) ?? systemName,
      roleName: roleNameOf(actor.role) || undefined,
      reason: entry.reason || undefined,
      changes,
      snapshot: entry.snapshot,
      metadata: entry.metadata ? clean(entry.metadata, settingsFor(cfg).isRedacted) : undefined,
      ip: req?.ip ?? ctx?.ip,
      userAgent: req?.get?.('user-agent') ?? ctx?.userAgent,
      requestId: ctx?.requestId,
      method: req?.method ?? ctx?.method,
      path: req ? req.originalUrl.split('?')[0] : ctx?.path,
    });
  } catch (error) {
    console.error(`❌ Failed to write audit log (${entry.action}):`, error);
  }
};

/** @deprecated Kept for existing callers; prefer `audit.event`. */
export const recordAudit = (req: AuthRequest, entry: AuditEntry): Promise<void> => writeAudit(entry, req);

const withTag = (entry: AuditEntry, tag?: AuditTag): AuditEntry => ({
  ...entry,
  action: tag?.action ?? entry.action,
  reason: tag?.reason ?? entry.reason,
  summary: tag?.summary ?? entry.summary,
  metadata: tag?.metadata ? { ...(entry.metadata ?? {}), ...tag.metadata } : entry.metadata,
});

export const audit = {
  /** Records a business event (sign-in, approval, download, email...). */
  event: (entry: AuditEntry, req?: AuthRequest) => writeAudit(entry, req),

  /** Records the creation of a record, with a field list and a snapshot. */
  created: (entityType: string, doc: unknown, tag?: AuditTag) => {
    const plain = toPlain(doc);
    return writeAudit(withTag({
      action: `${entityType}.create`,
      entityType,
      entityId: plain?._id,
      entityRef: refOf(entityType, plain),
      changes: deepDiff(undefined, plain, entityType),
      snapshot: snapshotOf(entityType, plain),
    }, tag));
  },

  /** Records an edit as a field-by-field diff. Nothing is written when nothing changed, unless tagged. */
  updated: async (entityType: string, before: unknown, after: unknown, tag?: AuditTag) => {
    const changes = deepDiff(before, after, entityType);
    if (!changes.length && !tag?.action) return;
    const plain = toPlain(after) ?? toPlain(before);
    const classified = tag?.action ? undefined : getEntityConfig(entityType).classify?.(changes, toPlain(before), plain);
    await writeAudit(withTag({
      action: classified ?? `${entityType}.update`,
      entityType,
      entityId: plain?._id,
      entityRef: refOf(entityType, plain) ?? refOf(entityType, before),
      changes,
    }, tag));
  },

  /** Records a deletion, keeping a full snapshot of what was removed. */
  deleted: (entityType: string, doc: unknown, tag?: AuditTag) => {
    const plain = toPlain(doc);
    return writeAudit(withTag({
      action: `${entityType}.delete`,
      entityType,
      entityId: plain?._id,
      entityRef: refOf(entityType, plain),
      snapshot: snapshotOf(entityType, plain),
    }, tag));
  },
};
