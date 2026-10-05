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
 */
export const ACTIONS = [...CRUD_ACTIONS, 'approve', 'accept', 'sign-on-behalf', 'revoke-signature', 'override', 'discount'] as const;

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
  order?: number;
}

const CRUD: PermissionAction[] = [...CRUD_ACTIONS];
const READ: PermissionAction[] = ['read'];
const SIGNING: PermissionAction[] = [...CRUD, 'approve', 'sign-on-behalf', 'revoke-signature'];

export const SYSTEM_MODULES: SystemModuleDef[] = [
  { key: 'reporting', name: 'Reporting', description: 'Reporting Module', parentKey: null, navigable: true, actions: READ },
  { key: 'marine', name: 'Marine', description: 'Marine Sub-module', parentKey: 'reporting', navigable: true, actions: READ },
  { key: 'marine.first-entry', name: 'First Entry', description: 'First entry survey pipeline', parentKey: 'marine', navigable: true, actions: READ },
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
  { key: 'admin.audit-log', name: 'Audit Log', description: 'History of override and controlled changes', parentKey: 'admin', navigable: false, actions: READ, order: 5 },
];

/** Roles (by name) that receive extra actions when the module is first created. Replaces the old hard-coded e-signature bypass list. */
export const INITIAL_ROLE_GRANTS: { roleName: string; moduleKey: string; actions: PermissionAction[] }[] = [
  { roleName: 'uqms-admin', moduleKey: 'marine.reports', actions: ['read', 'sign-on-behalf', 'revoke-signature'] },
  { roleName: 'uqms-admin', moduleKey: 'marine.certificates', actions: ['read', 'sign-on-behalf', 'revoke-signature'] },
];

export const MARINE_KEYS = ['marine.entries', 'marine.bookings', 'marine.reports', 'marine.certificates'];
export const HR_KEYS = SYSTEM_MODULES.filter((m) => m.parentKey === 'hr').map((m) => m.key);
export const FINANCE_KEYS = SYSTEM_MODULES.filter((m) => m.parentKey === 'finance').map((m) => m.key);
