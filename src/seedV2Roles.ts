/**
 * V2: creates (or tops up) the fixed survey roles. Existing grants on these roles are kept;
 * this only adds the grants listed below. Run with `npm run seed:v2-roles`.
 *
 * Point MONGODB_URI at the database you mean to change before running it.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from './models/Role';
import Module from './models/Module';
import { syncSystemModules, normalizePermissions, loadModuleInfo } from './config/seedModules';
import type { PermissionAction } from './config/permissionRegistry';

dotenv.config();

type Grants = Record<string, PermissionAction[]>;

const ASSISTANT: Grants = {
  jobs: ['read'],
  'jobs.marine': ['read'],
  'jobs.industrial': ['read'],
  'jobs.reporting': ['create', 'read', 'update', 'delete'],
  // The reporting workspace reuses the existing first entry, booking, report and certificate APIs.
  'marine.entries': ['create', 'read', 'update'],
  'marine.bookings': ['create', 'read', 'update'],
  'marine.reports': ['create', 'read', 'update'],
  'marine.certificates': ['create', 'read', 'update'],
};

const SURVEYOR: Grants = {
  ...ASSISTANT,
  'jobs.reporting': ['create', 'read', 'update', 'delete', 'approve'],
  'marine.reports': ['create', 'read', 'update', 'approve'],
  'marine.certificates': ['create', 'read', 'update', 'approve'],
};

const MANAGER: Grants = {
  ...SURVEYOR,
  jobs: ['read', 'view-all'],
  'surveyor-allocation': ['create', 'read', 'update', 'delete', 'override'],
  'view-report': ['read', 'export'],
  authorization: ['read', 'approve'],
  approvals: ['read', 'approve'],
};

export const V2_ROLES: Record<string, Grants> = {
  'assistant-surveyor': ASSISTANT,
  surveyor: SURVEYOR,
  manager: MANAGER,
};
 

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping');
  console.log('✅ Connected to MongoDB');
  await syncSystemModules();

  const modules = await Module.find({ key: { $exists: true } }).select('key').lean();
  const idByKey = new Map(modules.map((m) => [m.key as string, String(m._id)]));
  const moduleInfo = await loadModuleInfo();

  for (const [roleName, grants] of Object.entries(V2_ROLES)) {
    let role = await Role.findOne({ roleName: new RegExp(`^${roleName}$`, 'i') });
    if (!role) role = new Role({ roleName, permissions: [] });

    const perms = role.permissions.map((p) => ({ module: String(p.module), actions: [...p.actions] }));
    for (const [key, actions] of Object.entries(grants)) {
      const moduleId = idByKey.get(key);
      if (!moduleId) {
        console.warn(`⚠️  Module "${key}" not found; skipped for ${roleName}.`);
        continue;
      }
      const entry = perms.find((p) => p.module === moduleId);
      if (entry) entry.actions = [...new Set([...entry.actions, ...actions])];
      else perms.push({ module: moduleId, actions: [...actions] });
    }
    role.permissions = normalizePermissions(perms, moduleInfo) as any;
    await role.save();
    console.log(`🛡️  Role "${role.roleName}" ready.`);
  }

  await mongoose.disconnect();
};

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
