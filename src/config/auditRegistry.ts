/**
 * Audit trail registry: the single place that describes what gets audited and how it is labelled.
 *
 * ── Auditing a new module ────────────────────────────────────────────────────────────────────────
 * 1. Add the record type to AUDIT_ENTITIES below (label, permission module, reference field, and any
 *    fields to redact or ignore, or ObjectId fields to resolve to names).
 * 2. In the model file, before `mongoose.model(...)`:
 *        schema.plugin(auditPlugin, { entityType: '<key>' });
 *    Every create, edit and delete through Mongoose is now recorded with a field-by-field diff.
 * 3. For business actions (approve, assign, sign, email, download...), add the action to AUDIT_ACTIONS
 *    and either tag the write:
 *        Model.findByIdAndUpdate(id, update, { new: true, audit: { action: 'x.approve', reason } })
 *        doc.$locals.audit = { action: 'x.approve' }; await doc.save();
 *    or, when nothing is written, record an event:
 *        await audit.event({ action: 'x.download', entityType: 'x', entityId, entityRef });
 * The Audit Log page reads labels from GET /api/audit-logs/meta, so no frontend change is needed.
 */
import type { AuditOperation, IAuditChange } from '../models/AuditLog';

export interface AuditEntityConfig {
  label: string;
  /** Mongoose model name; lets events that only carry an id look up the record's reference. */
  model?: string;
  /** Permission module key the record belongs to (used for filtering). */
  module: string;
  /** Field(s) holding a human-readable reference; the first non-empty one is used. */
  refField?: string | string[];
  /** Field names (any depth) that are never diffed. */
  ignore?: string[];
  /** Default-ignored fields this entity still wants diffed (e.g. a user-editable createdAt). */
  track?: string[];
  /** Field names (any depth) whose values are stored as '[redacted]'. */
  redact?: string[];
  /** Field names (any depth) holding ObjectIds that are resolved to a display name at write time. */
  displayRefs?: Record<string, string>;
  /** How items of an array field are matched between versions (default: `_id`, then position). */
  arrayKeys?: Record<string, string>;
  /** Readable names for field paths (array positions removed), e.g. { 'approval.approvedByName': 'Approved by' }. */
  fieldLabels?: Record<string, string>;
  /**
   * Names an untagged edit from what changed (e.g. a status change becomes 'x.approve').
   * Return undefined to keep the plain '<entity>.update'.
   */
  classify?: (changes: IAuditChange[], before: any, after: any) => string | undefined;
}

const changed = (changes: IAuditChange[], test: RegExp) => changes.some((c) => test.test(c.field));

/** Classifies Draft ⇄ Approved reports. */
const reportStatus = (prefix: string) => (changes: IAuditChange[], _before: any, after: any) => {
  if (!changed(changes, /^status$/)) return undefined;
  return after?.status === 'Approved' ? `${prefix}.approve` : `${prefix}.status`;
};

/** Applied to every entity on top of its own settings. */
export const DEFAULT_IGNORE = ['_id', '__v', 'id', 'createdAt', 'updatedAt', 'updatedBy'];
export const DEFAULT_REDACT = ['password', 'passwordHash', 'token', 'secret', 'apiKey'];
/** ObjectId fields resolved to user names on every entity. */
export const DEFAULT_DISPLAY_REFS: Record<string, string> = {
  createdBy: 'User', statusChangedBy: 'User', reviewedBy: 'User', approvedBy: 'User', issuedBy: 'User', appliedBy: 'User', signedBy: 'User',
};

/** Field used to name a referenced record, per model. */
export const MODEL_NAME_FIELDS: Record<string, string[]> = {
  User: ['fullName', 'username', 'email'],
  Role: ['roleName'],
  Module: ['name', 'key'],
  Vessel: ['vesselName', 'uqmsNumber'],
  VesselType: ['name'],
  SurveyType: ['name'],
  AreaOfOperation: ['name'],
  ChecklistQuestion: ['item'],
  RecEquipQues: ['codeRefNo', 'description'],
  FeeItem: ['description', 'name'],
  Request: ['jobNumber', 'requestNumber'],
};

/** Stored-PDF bookkeeping, rewritten on every render; generating a PDF is recorded as its own event instead. */
const PDF_FIELDS = [
  'pdf', 'pdfKey', 'pdfUrl', 'signatureField', 'dailyReportSignatureField',
  'dailyReportPdfKey', 'dailyReportPdfUrl', 'dailyReportPdfBucket', 'dailyReportPdfFilename',
  'dailyReportPdfSize', 'dailyReportPdfEtag', 'dailyReportPdfGeneratedAt',
];

export const AUDIT_ENTITIES: Record<string, AuditEntityConfig> = {
  // ── System ───────────────────────────────────────────────────────────────
  auth: { label: 'Sign-in', module: 'admin.users' },
  'audit-log': { label: 'Audit log', module: 'admin.audit-log' },
  file: { label: 'Uploaded file', module: '' },

  // ── Admin ────────────────────────────────────────────────────────────────
  user: {
    label: 'User', model: 'User', module: 'admin.users', refField: ['username', 'email'],
    displayRefs: { role: 'Role' },
    fieldLabels: { fullName: 'Full name', nameWithInitials: 'Name with initials', phoneNumber: 'Phone', dob: 'Date of birth', empNumber: 'Employee no.' },
  },
  role: {
    label: 'Role', model: 'Role', module: 'admin.roles', refField: 'roleName',
    displayRefs: { module: 'Module' }, arrayKeys: { permissions: 'module' },
    fieldLabels: { roleName: 'Role name' },
  },
  module: { label: 'Module', model: 'Module', module: 'admin.modules', refField: ['key', 'name'], displayRefs: { parentId: 'Module' }, fieldLabels: { parentId: 'Parent' } },
  'checklist-question': {
    label: 'Checklist question', model: 'ChecklistQuestion', module: 'admin.master-data', refField: 'item',
    displayRefs: { surveyCategories: 'SurveyType', areaOfOperations: 'AreaOfOperation', boatTypes: 'VesselType' },
  },
  'vessel-code': { label: 'Vessel code', model: 'VesselCode', module: 'admin.master-data', refField: 'code' },
  'rec-equip-ques': { label: 'Equipment question', model: 'RecEquipQues', module: 'admin.master-data', refField: 'codeRefNo' },
  'document-template': { label: 'Document template', model: 'DocumentTemplate', module: 'admin.master-data', refField: 'documentName' },

  // ── Survey / marine ──────────────────────────────────────────────────────
  request: {
    label: 'Survey request', model: 'Request', module: 'new-request', refField: ['requestNumber', 'jobNumber'],
    displayRefs: { vesselType: 'VesselType', areaOfOperation: 'AreaOfOperation', surveyTypes: 'SurveyType', reviewedBy: 'User' },
    track: ['createdAt'],
    classify: (changes) => (changed(changes, /^(status|approvalStatus)$/) ? 'request.status' : undefined),
  },
  'request-document': { label: 'Request document', model: 'RequestDocument', module: 'new-request', refField: ['filename', 'requestNumber'] },
  'first-entry': {
    label: 'First entry', model: 'FirstEntry', module: 'marine.entries', refField: 'quotationNumber',
    displayRefs: { request: 'Request', vessel: 'Vessel' },
  },
  'schedule-ii': { label: 'Schedule II', model: 'ScheduleII', module: 'marine.entries', displayRefs: { firstEntry: 'FirstEntry' } },
  vessel: {
    label: 'Vessel', model: 'Vessel', module: 'marine.entries', refField: ['vesselName', 'uqmsNumber'],
    displayRefs: { vesselType: 'VesselType', areaOfOperation: 'AreaOfOperation', sisterShips: 'Vessel' },
  },
  'vessel-type': { label: 'Vessel type', model: 'VesselType', module: 'marine.entries', refField: 'name' },
  booking: {
    label: 'Survey booking', model: 'FirstEntrySurveyBooking', module: 'marine.bookings', refField: ['reportNo', 'shipName'],
    displayRefs: { surveyorId: 'User', vesselId: 'Vessel', requestIds: 'Request' },
    fieldLabels: { 'visitDetails.surveyorAssignments.surveyorId': 'Surveyor' },
    classify: (changes) =>
      changed(changes, /surveyorAssignments/) ? 'booking.surveyor.assign' : changed(changes, /^status$/) ? 'booking.status' : undefined,
  },
  'first-entry-survey-report': {
    label: 'First entry survey report', model: 'FirstEntrySurveyReport', module: 'marine.reports', refField: ['reportNo', 'shipName'],
    displayRefs: { vesselId: 'Vessel' },
    classify: reportStatus('first-entry-survey-report'),
  },
  'daily-report': {
    label: 'Daily visit report', model: 'FirstEntryFullReport', module: 'marine.reports', refField: 'uqmsNo',
    ignore: PDF_FIELDS,
    displayRefs: { surveyorId: 'User', checklistQuestionId: 'ChecklistQuestion', vesselId: 'Vessel' },
    arrayKeys: { checklist: 'checklistQuestionId' },
  },
  'survey-report': {
    label: 'Survey report', model: 'SurveyReport', module: 'marine.certificates', refField: 'certificateNumber',
    ignore: PDF_FIELDS, redact: ['imageData', 'signatureImage'], displayRefs: { vesselId: 'Vessel' },
    classify: reportStatus('survey-report'),
  },
  'docking-cert': {
    label: 'Docking survey certificate', model: 'DockingSurveyCert', module: 'marine.certificates', refField: 'certificateNumber',
    ignore: PDF_FIELDS, redact: ['imageData', 'signatureImage'], displayRefs: { vesselId: 'Vessel' },
  },
  scccos: {
    label: 'Certificate of Survey (COS)', model: 'SCCCOS', module: 'marine.certificates', refField: 'certificateNumber',
    ignore: PDF_FIELDS, redact: ['imageData', 'signatureImage'], displayRefs: { vesselId: 'Vessel', issuedBy: 'User' },
  },
  note: { label: 'Vessel note', model: 'Note', module: 'marine.reports', refField: 'noteCode', displayRefs: { vessel: 'Vessel', vesselId: 'Vessel' } },
  'vessel-equipment-record': {
    label: 'Equipment record', model: 'VesselEquipmentRecord', module: 'marine.reports',
    displayRefs: { vesselId: 'Vessel', questionId: 'RecEquipQues' },
    arrayKeys: { equipmentRecords: 'questionId' },
  },

  // ── Finance ──────────────────────────────────────────────────────────────
  quotation: {
    label: 'Quotation', model: 'Quotation', module: 'finance.quotations', refField: 'quotationNumber',
    displayRefs: { feeItem: 'FeeItem', request: 'Request' },
    fieldLabels: { totalLkr: 'Total (LKR)', subtotalLkr: 'Subtotal (LKR)', discountLkr: 'Discount (LKR)', exchangeRate: 'Exchange rate' },
  },
};

export interface AuditActionDef {
  label: string;
  operation: AuditOperation;
}

/**
 * Business actions. Plain create/update/delete actions (`<entityType>.create` etc.) are derived
 * automatically and need no entry here.
 */
export const AUDIT_ACTIONS: Record<string, AuditActionDef> = {
  // Sign-in
  'auth.login': { label: 'Signed in', operation: 'login' },
  'auth.login.failed': { label: 'Sign-in failed', operation: 'login' },
  'auth.logout': { label: 'Signed out', operation: 'logout' },

  // Admin
  'user.role.change': { label: 'User role changed', operation: 'update' },
  'user.password.change': { label: 'Password changed', operation: 'update' },
  'user.profile.update': { label: 'Own profile updated', operation: 'update' },
  'module.permissions.cascade': { label: 'Role permissions removed with module change', operation: 'update' },
  'audit.export': { label: 'Audit log exported', operation: 'export' },

  // Survey requests
  'request.create.override': { label: 'Request created (override)', operation: 'create' },
  'request.update.override': { label: 'Request edited (override)', operation: 'update' },
  'request.accept': { label: 'Web request accepted', operation: 'approve' },
  'request.reject': { label: 'Web request rejected', operation: 'status' },
  'request.document.add': { label: 'Request document added', operation: 'upload' },
  'request.document.replace': { label: 'Request document replaced', operation: 'upload' },
  'request.document.delete': { label: 'Request document deleted', operation: 'delete' },
  'request.signed-pdf.upload': { label: 'Signed RFS uploaded', operation: 'upload' },
  'request.signed-pdf.remove': { label: 'Signed RFS removed', operation: 'delete' },
  'request.public.create': { label: 'Request received from website', operation: 'create' },
  'request.status': { label: 'Request status changed', operation: 'status' },

  // First entry / bookings / reports
  'schedule-ii.create': { label: 'Schedule II created', operation: 'create' },
  'vessel.uqms-number.assign': { label: 'UQMS number assigned', operation: 'assign' },
  'booking.surveyor.assign': { label: 'Surveyor assignment changed', operation: 'assign' },
  'booking.status': { label: 'Booking status changed', operation: 'status' },
  'first-entry-survey-report.approve': { label: 'First entry survey report approved', operation: 'approve' },
  'first-entry-survey-report.status': { label: 'First entry survey report status changed', operation: 'status' },
  'survey-report.approve': { label: 'Survey report approved', operation: 'approve' },
  'survey-report.status': { label: 'Survey report status changed', operation: 'status' },
  'remark.create': { label: 'Remark added', operation: 'create' },
  'remark.update': { label: 'Remark edited', operation: 'update' },
  'remark.close': { label: 'Remark closed', operation: 'status' },
  'remark.reopen': { label: 'Remark reopened', operation: 'status' },
  'comment.add': { label: 'Comment added', operation: 'create' },
  'comment.update': { label: 'Comment edited', operation: 'update' },
  'comment.delete': { label: 'Comment deleted', operation: 'delete' },
  'notes.update': { label: 'Vessel notes updated', operation: 'update' },
  'equipment-record.update': { label: 'Equipment record saved', operation: 'update' },

  // Documents (any record type)
  'document.annotate': { label: 'Document edited (stamp / strike-off / cross / text)', operation: 'update' },
  'document.sign': { label: 'Document signed', operation: 'sign' },
  'document.sign.on-behalf': { label: 'Document signed on behalf', operation: 'sign' },
  'document.sign.revoke': { label: 'Signature revoked', operation: 'revoke' },
  'document.generate': { label: 'PDF generated', operation: 'print' },
  'document.view': { label: 'Document viewed', operation: 'view' },
  'document.download': { label: 'Document downloaded', operation: 'download' },
  'document.print': { label: 'Document printed', operation: 'print' },
  'document.email': { label: 'Document emailed', operation: 'email' },
  'document.upload': { label: 'File uploaded', operation: 'upload' },

  // Quotations
  'quotation.discount': { label: 'Quotation discount', operation: 'update' },
  'quotation.approve': { label: 'Quotation approved', operation: 'approve' },
  'quotation.approval.revoke': { label: 'Quotation approval revoked', operation: 'revoke' },
  'quotation.status': { label: 'Quotation status changed', operation: 'status' },
  'quotation.superseded': { label: 'Quotation superseded by a revision', operation: 'status' },
  'quotation.email': { label: 'Quotation emailed to client', operation: 'email' },
};

const DEFAULT_VERBS: Record<string, { verb: string; operation: AuditOperation }> = {
  create: { verb: 'created', operation: 'create' },
  update: { verb: 'updated', operation: 'update' },
  delete: { verb: 'deleted', operation: 'delete' },
};

export const getEntityConfig = (entityType: string): AuditEntityConfig =>
  AUDIT_ENTITIES[entityType] ?? { label: entityType, module: '' };

/** Label and operation for an action, deriving `<entity>.create|update|delete` automatically. */
export const actionInfo = (action: string): AuditActionDef => {
  if (AUDIT_ACTIONS[action]) return AUDIT_ACTIONS[action];
  const dot = action.lastIndexOf('.');
  const entity = action.slice(0, dot);
  const def = DEFAULT_VERBS[action.slice(dot + 1)];
  if (def && AUDIT_ENTITIES[entity]) return { label: `${AUDIT_ENTITIES[entity].label} ${def.verb}`, operation: def.operation };
  return { label: action, operation: def?.operation ?? 'other' };
};

/** All labels, served to the Audit Log page. */
export const auditMeta = () => {
  const actions: Record<string, AuditActionDef> = {};
  for (const [type, cfg] of Object.entries(AUDIT_ENTITIES)) {
    if (type === 'auth' || type === 'audit-log' || type === 'file') continue;
    for (const [suffix, def] of Object.entries(DEFAULT_VERBS)) {
      actions[`${type}.${suffix}`] = { label: `${cfg.label} ${def.verb}`, operation: def.operation };
    }
  }
  Object.assign(actions, AUDIT_ACTIONS);
  return {
    entities: Object.fromEntries(Object.entries(AUDIT_ENTITIES).map(([k, v]) => [k, { label: v.label, module: v.module }])),
    actions,
  };
};
