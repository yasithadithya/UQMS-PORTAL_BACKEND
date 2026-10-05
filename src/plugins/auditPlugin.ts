import { Schema, Query, Model } from 'mongoose';
import { getAuditContext } from '../middleware/requestContext';
import { audit, AuditTag } from '../services/auditService';

/**
 * Mongoose plugin that writes an audit entry for every create, edit and delete of a model,
 * with a field-by-field diff. Register the record type in config/auditRegistry.ts, then:
 *
 *     schema.plugin(auditPlugin, { entityType: 'vessel' });
 *
 * Tag a write with a business action (one entry, not two):
 *     Model.findByIdAndUpdate(id, update, { new: true, audit: { action: 'x.approve', reason } })
 *     doc.$locals.audit = { action: 'x.approve' };  await doc.save();
 * Skip a write with `{ audit: false }` / `doc.$locals.audit = false`.
 */

// Lets every write accept `{ audit: { action, reason, metadata } }` (or `false`) in its options.
declare module 'mongoose' {
  interface QueryOptions {
    audit?: AuditTag | false;
  }
}
declare module 'mongodb' {
  interface UpdateOptions {
    audit?: AuditTag | false;
  }
  interface DeleteOptions {
    audit?: AuditTag | false;
  }
}

export interface AuditPluginOptions {
  entityType: string;
}

/** Most records audited by one updateMany/deleteMany call. */
const BULK_LIMIT = 500;

type TagOption = AuditTag | false | undefined;

const contextSkips = () => getAuditContext()?.skipAudit === true;

const tagOfQuery = (query: Query<any, any>): TagOption => (query.getOptions() as { audit?: TagOption }).audit;

const run = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (error) {
    console.error(`❌ Audit plugin (${label}) failed:`, error);
  }
};

export function auditPlugin(schema: Schema, options: AuditPluginOptions): void {
  const { entityType } = options;

  // ── document.save() ────────────────────────────────────────────────────
  schema.pre('save', async function () {
    const tag = this.$locals.audit as TagOption;
    if (tag === false || contextSkips()) return;
    this.$locals.auditWasNew = this.isNew;
    if (!this.isNew) {
      await run(`${entityType}.save`, async () => {
        this.$locals.auditBefore = await (this.constructor as Model<any>).findById(this._id).lean();
      });
    }
  });

  schema.post('save', async function (doc) {
    const tag = doc.$locals.audit as TagOption;
    const before = doc.$locals.auditBefore;
    const wasNew = doc.$locals.auditWasNew;
    delete doc.$locals.audit;
    delete doc.$locals.auditBefore;
    delete doc.$locals.auditWasNew;
    if (tag === false || contextSkips() || wasNew === undefined) return;
    await run(`${entityType}.save`, () =>
      wasNew ? audit.created(entityType, doc, tag) : audit.updated(entityType, before, doc, tag)
    );
  });

  // ── Model.insertMany() ─────────────────────────────────────────────────
  schema.post('insertMany', async function (docs: any[]) {
    if (contextSkips()) return;
    await run(`${entityType}.insertMany`, async () => {
      for (const doc of docs.slice(0, BULK_LIMIT)) await audit.created(entityType, doc);
    });
  });

  // ── findOneAndUpdate / findByIdAndUpdate / updateOne ───────────────────
  schema.pre(['findOneAndUpdate', 'updateOne'], { document: false, query: true }, async function (this: any) {
    if (tagOfQuery(this) === false || contextSkips()) return;
    await run(`${entityType}.update`, async () => {
      this._auditBefore = (await this.model.findOne(this.getFilter()).lean()) ?? null;
    });
  });

  schema.post(['findOneAndUpdate', 'updateOne'], { document: false, query: true }, async function (this: any) {
    const tag = tagOfQuery(this);
    if (tag === false || contextSkips() || this._auditBefore === undefined) return;
    await run(`${entityType}.update`, async () => {
      const before = this._auditBefore;
      if (before) {
        const after = await this.model.findById(before._id).lean();
        if (after) await audit.updated(entityType, before, after, tag || undefined);
      } else if (this.getOptions().upsert) {
        const created = await this.model.findOne(this.getFilter()).lean();
        if (created) await audit.created(entityType, created, tag || undefined);
      }
    });
  });

  // ── updateMany ─────────────────────────────────────────────────────────
  schema.pre('updateMany', { document: false, query: true }, async function (this: any) {
    if (tagOfQuery(this) === false || contextSkips()) return;
    await run(`${entityType}.updateMany`, async () => {
      this._auditBefore = await this.model.find(this.getFilter()).limit(BULK_LIMIT).lean();
    });
  });

  schema.post('updateMany', { document: false, query: true }, async function (this: any) {
    const tag = tagOfQuery(this);
    const before: any[] | undefined = this._auditBefore;
    if (tag === false || contextSkips() || !before?.length) return;
    await run(`${entityType}.updateMany`, async () => {
      const afters = await this.model.find({ _id: { $in: before.map((d) => d._id) } }).lean();
      const afterById = new Map(afters.map((d: any) => [String(d._id), d]));
      for (const b of before) {
        const after = afterById.get(String(b._id));
        if (after) await audit.updated(entityType, b, after, tag || undefined);
      }
    });
  });

  // ── deleteOne / findOneAndDelete / findByIdAndDelete / deleteMany (doc.deleteOne() runs these too) ──
  schema.pre(['deleteOne', 'findOneAndDelete'], { document: false, query: true }, async function (this: any) {
    if (tagOfQuery(this) === false || contextSkips()) return;
    await run(`${entityType}.delete`, async () => {
      this._auditBefore = await this.model.findOne(this.getFilter()).lean();
    });
  });

  schema.pre('deleteMany', { document: false, query: true }, async function (this: any) {
    if (tagOfQuery(this) === false || contextSkips()) return;
    await run(`${entityType}.deleteMany`, async () => {
      this._auditBefore = await this.model.find(this.getFilter()).limit(BULK_LIMIT).lean();
    });
  });

  schema.post(['deleteOne', 'findOneAndDelete', 'deleteMany'], { document: false, query: true }, async function (this: any) {
    const tag = tagOfQuery(this);
    const before = this._auditBefore;
    if (tag === false || contextSkips() || !before) return;
    await run(`${entityType}.delete`, async () => {
      const docs: any[] = Array.isArray(before) ? before : [before];
      // Confirm each record is really gone before recording it.
      const remaining = new Set(
        (await this.model.find({ _id: { $in: docs.map((d) => d._id) } }).select('_id').lean()).map((d: any) => String(d._id))
      );
      for (const doc of docs) {
        if (!remaining.has(String(doc._id))) await audit.deleted(entityType, doc, tag || undefined);
      }
    });
  });
}

export default auditPlugin;
