/**
 * Single source of truth for the permission model.
 *
 * System modules are identified by a stable `key` (never by their display name), so renaming a
 * module can't break access control. Backend routes and frontend screens both reference these keys.
 */

export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'] as const;

/**
 * `override` lets Technical Committee users bypass workflow locks (create survey requests in the ERP,
 * edit requests after the RFS is printed); every use is written to the audit log.
 * `discount` gates editing quotation discounts.
 * `accept` records the client's response to a quotation (accepted or rejected), separate from internal `approve`.
 * `export` allows downloading data in bulk (e.g. the audit log as CSV).
 */
/** `view-all` lets a user see every job instead of only the jobs allocated to them (managers). */
export const ACTIONS = [...CRUD_ACTIONS, 'approve', 'accept', 'sign-on-behalf', 'revoke-signature', 'override', 'discount', 'export', 'view-all'] as const;

export type PermissionAction = (typeof ACTIONS)[number];

export interface SystemModuleDef {
  key: string;
  name: string;
  description: string;
  parentKey: string | null;
  /** false = permission-only module: shown in Role Management but not in navigation or routing. */
  navigable: boolean;
  actions: PermissionAction[];
  /**
   * Migration: when this module is first created, each role's actions on the module with this key
   * are copied onto it (limited to this module's actions), so nobody loses access.
   */
  inheritFrom?: string;
  /** Only inherit from roles that hold this action on `inheritFrom`. */
  inheritRequires?: PermissionAction;
  /**
   * Migration: when an existing module first gains an action listed here, every role holding the
   * mapped source action on it receives the new action too (e.g. split one action into two).
   */
  newActionsFrom?: Partial<Record<PermissionAction, PermissionAction>>;
  /**
   * Migration: rename an existing module still called this to `name` (module names are unique, so
   * this frees the old name for another module). Names set by an admin are left alone.
   */
  renameFrom?: string;
  order?: number;
}

const CRUD: PermissionAction[] = [...CRUD_ACTIONS];
const READ: PermissionAction[] = ['read'];
const SIGNING: PermissionAction[] = [...CRUD, 'approve', 'sign-on-behalf', 'revoke-signature'];

export const SYSTEM_MODULES: SystemModuleDef[] = [
  { key: 'reporting', name: 'Reporting', description: 'Reporting Module (pre-V2 screens; replaced by My Jobs, kept for permissions)', parentKey: null, navigable: false, actions: READ },
  // Holds the reporting permissions; "Marine" under My Jobs (jobs.marine) is the sector access module.
  { key: 'marine', name: 'Marine Survey', renameFrom: 'Marine', description: 'Marine Sub-module', parentKey: 'reporting', navigable: false, actions: READ },
  { key: 'marine.first-entry', name: 'First Entry', description: 'First entry survey pipeline', parentKey: 'marine', navigable: false, actions: READ },
  {
    key: 'marine.entries', name: 'First Entry & Vessels', description: 'First entries, Schedule II and vessel records',
    parentKey: 'marine.first-entry', navigable: false, actions: CRUD, inheritFrom: 'marine.first-entry', order: 1,
  },
  {
    key: 'marine.bookings', name: 'Survey Bookings', description: 'Survey bookings, visits and surveyor assignments',
    parentKey: 'marine.first-entry', navigable: false, actions: CRUD, inheritFrom: 'marine.first-entry', order: 2,
  },
  {
    key: 'marine.reports', name: 'Survey Reports & Checklists', description: 'Survey reports, daily visit checklists, equipment records and vessel notes',
    parentKey: 'marine.first-entry', navigable: false, actions: SIGNING, inheritFrom: 'marine.first-entry', order: 3,
  },
  {
    key: 'marine.certificates', name: 'Certificates', description: 'Docking survey, SCCCOS and final survey report certificates',
    parentKey: 'marine.first-entry', navigable: false, actions: SIGNING, inheritFrom: 'marine.first-entry', order: 4,
  },

  {
    key: 'new-request', name: 'New Request', description: 'Survey request intake (override = create requests in the ERP and edit locked requests)',
    parentKey: null, navigable: true, actions: [...CRUD, 'override'],
  },

  // ── V2 survey workflow ───────────────────────────────────────────────────
  {
    key: 'surveyor-allocation', name: 'Surveyor Allocation', description: 'Allocate surveyors to accepted jobs, set the main survey type and issue UQMS numbers (override = turn off MSS proof)',
    parentKey: null, navigable: true, actions: [...CRUD, 'override'], order: 3,
  },
  {
    key: 'jobs', name: 'My Jobs', description: 'Open survey jobs and their workspace. Surveyors and assistant surveyors see only their own jobs; other users see all (view-all = also edit jobs not allocated to you)',
    parentKey: null, navigable: true, actions: ['read', 'view-all'], order: 4,
  },
  // Sector access: a user sees a sector's jobs only with read on its module.
  {
    key: 'jobs.marine', name: 'Marine', description: 'Marine jobs (First Entry, Periodical, Occasional, New Constructions, Audits)',
    parentKey: 'jobs', navigable: true, actions: READ, inheritFrom: 'jobs', order: 1,
  },
  {
    key: 'jobs.industrial', name: 'Industrial', description: 'Industrial jobs (Audits, Surveys)',
    parentKey: 'jobs', navigable: true, actions: READ, inheritFrom: 'jobs', order: 2,
  },
  {
    key: 'jobs.reporting', name: 'Survey Reporting', description: 'Survey reporting workspace (approve = surveyor review, certificate generation and signing)',
    parentKey: 'jobs', navigable: false, actions: SIGNING, order: 3,
  },
  { key: 'view-report', name: 'View Report', description: 'Read-only view of completed survey reports', parentKey: null, navigable: true, actions: ['read', 'export'], order: 5 },
  { key: 'authorization', name: 'Authorization', description: 'Manager approval of signed survey reports', parentKey: null, navigable: true, actions: ['read', 'approve'], order: 6 },
  {
    key: 'approvals', name: 'Approvals', description: 'QMS change control (approve = level 1 approval, accept = level 2 acceptance that puts the change into effect)',
    parentKey: null, navigable: true, actions: ['read', 'approve', 'accept'], newActionsFrom: { accept: 'approve' }, order: 7,
  },
  { key: 'ships', name: 'Ships', description: 'Ships module', parentKey: null, navigable: true, actions: CRUD, order: 8 },
  { key: 'qms', name: 'QMS', description: 'Quality Management System', parentKey: null, navigable: true, actions: READ, order: 9 },
  { key: 'qms.qms', name: 'QMS Documents', description: 'Quality manual and procedures', parentKey: 'qms', navigable: true, actions: CRUD, order: 1 },
  { key: 'qms.forms', name: 'Forms', description: 'Controlled forms', parentKey: 'qms', navigable: true, actions: CRUD, order: 2 },
  {
    key: 'qms.checklist', name: 'Checklist', description: 'Survey checklist questions (changes go to Approvals)',
    parentKey: 'qms', navigable: true, actions: CRUD, inheritFrom: 'admin.master-data', order: 3,
  },
  { key: 'qms.sop', name: 'SOP', description: 'Standard operating procedures', parentKey: 'qms', navigable: true, actions: CRUD, order: 4 },
  { key: 'qms.jd', name: 'JD', description: 'Job descriptions', parentKey: 'qms', navigable: true, actions: CRUD, order: 5 },
  { key: 'previous-docs', name: 'Previous Docs', description: 'Documents from surveys done before the portal', parentKey: null, navigable: true, actions: CRUD, order: 20 },

  { key: 'hr', name: 'HR', description: 'Human Resources Module', parentKey: null, navigable: true, actions: READ },
  {
    key: 'hr.employees', name: 'Employees & Organisation', description: 'Employees, departments, job titles, documents and on/offboarding',
    parentKey: 'hr', navigable: false, actions: CRUD, inheritFrom: 'hr', inheritRequires: 'update', order: 1,
  },
  { key: 'hr.attendance', name: 'Attendance', description: 'Attendance logs', parentKey: 'hr', navigable: false, actions: CRUD, inheritFrom: 'hr', inheritRequires: 'update', order: 2 },
  {
    key: 'hr.leave', name: 'Leave & Holidays', description: 'Leave requests, balances, leave types and public holidays',
    parentKey: 'hr', navigable: false, actions: [...CRUD, 'approve'], inheritFrom: 'hr', inheritRequires: 'update', order: 3,
  },
  {
    key: 'hr.payroll', name: 'Payroll', description: 'Salary structures and payroll runs',
    parentKey: 'hr', navigable: false, actions: [...CRUD, 'approve'], inheritFrom: 'hr', inheritRequires: 'update', order: 4,
  },
  { key: 'hr.performance', name: 'Performance', description: 'Review cycles, goals and appraisals', parentKey: 'hr', navigable: false, actions: CRUD, inheritFrom: 'hr', inheritRequires: 'update', order: 5 },
  { key: 'hr.training', name: 'Training', description: 'Training programs, sessions and enrollments', parentKey: 'hr', navigable: false, actions: CRUD, inheritFrom: 'hr', inheritRequires: 'update', order: 6 },
  { key: 'hr.announcements', name: 'Announcements', description: 'Company announcements', parentKey: 'hr', navigable: false, actions: CRUD, inheritFrom: 'hr', inheritRequires: 'update', order: 7 },

  { key: 'finance', name: 'Finance', description: 'Finance Module', parentKey: null, navigable: true, actions: READ },
  {
    key: 'finance.quotations', name: 'Quotations', description: 'Client quotations for requests and jobs (approve = internal approval, accept = record client accept or reject, discount = edit discounts)',
    parentKey: 'finance', navigable: false, actions: [...CRUD, 'approve', 'accept', 'discount'], newActionsFrom: { accept: 'approve' }, order: 1,
  },
  {
    key: 'finance.fee-structure', name: 'Fee Structure', description: 'Standard survey fees and additional charges',
    parentKey: 'finance', navigable: false, actions: CRUD, order: 2,
  },

  { key: 'admin', name: 'Admin', description: 'Admin Module', parentKey: null, navigable: true, actions: READ },
  { key: 'admin.users', name: 'User Management', description: 'Manage system users', parentKey: 'admin', navigable: false, actions: CRUD, order: 1 },
  { key: 'admin.roles', name: 'Role Management', description: 'Manage roles and permissions', parentKey: 'admin', navigable: false, actions: CRUD, order: 2 },
  { key: 'admin.modules', name: 'Module Management', description: 'Manage the module tree', parentKey: 'admin', navigable: false, actions: CRUD, order: 3 },
  {
    key: 'admin.master-data', name: 'Master Data', description: 'Checklist questions, vessel codes, equipment questions and document templates',
    parentKey: 'admin', navigable: false, actions: CRUD, order: 4,
  },
  { key: 'admin.audit-log', name: 'Audit Log', description: 'Full history of who changed what, sign-ins and document activity (export = download as CSV)', parentKey: 'admin', navigable: false, actions: ['read', 'export'], order: 5 },
];

/** Roles (by name) that receive extra actions when the module is first created. Replaces the old hard-coded e-signature bypass list. */
export const INITIAL_ROLE_GRANTS: { roleName: string; moduleKey: string; actions: PermissionAction[] }[] = [
  { roleName: 'uqms-admin', moduleKey: 'marine.reports', actions: ['read', 'sign-on-behalf', 'revoke-signature'] },
  { roleName: 'uqms-admin', moduleKey: 'marine.certificates', actions: ['read', 'sign-on-behalf', 'revoke-signature'] },
];

export const MARINE_KEYS = ['marine.entries', 'marine.bookings', 'marine.reports', 'marine.certificates'];
export const HR_KEYS = SYSTEM_MODULES.filter((m) => m.parentKey === 'hr').map((m) => m.key);
export const FINANCE_KEYS = SYSTEM_MODULES.filter((m) => m.parentKey === 'finance').map((m) => m.key);
