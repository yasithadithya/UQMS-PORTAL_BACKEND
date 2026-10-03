import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from './models/Role';
import { SYSTEM_MODULES, PermissionAction } from './config/permissionRegistry';
import { loadModuleInfo, normalizePermissions, syncSystemModules } from './config/seedModules';
import Module from './models/Module';

dotenv.config();

const TECHNICAL_COMMITTEE_ROLE_NAME = 'technical-committee';

/** Modules the Technical Committee does not need (account and module administration). */
const EXCLUDED = new Set(['admin.users', 'admin.roles', 'admin.modules']);

/** Extra actions on top of `read` everywhere. */
const GRANTS: Record<string, PermissionAction[]> = {
  'new-request': ['update', 'override'],
  'finance.quotations': ['create', 'update', 'approve', 'discount'],
  'marine.reports': ['approve', 'sign-on-behalf', 'revoke-signature'],
  'marine.certificates': ['approve', 'sign-on-behalf', 'revoke-signature'],
  'admin.audit-log': ['read'],
};

/**
 * Creates (or tops up) the Technical Committee role: read access to every operational interface,
 * survey-request override, discount control and controlled-document functions. Existing grants on
 * the role are kept, so re-running this is safe. Edit the role afterwards in Role Management.
 */
const seedTechnicalCommittee = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Make sure modules carry the latest actions (override, discount, audit-log) before granting them.
    await syncSystemModules();

    const keyed = await Module.find({ key: { $in: SYSTEM_MODULES.map((m) => m.key) } }).select('key').lean();
    const idByKey = new Map(keyed.map((m) => [m.key as string, String(m._id)]));

    const wanted = SYSTEM_MODULES.filter((def) => !EXCLUDED.has(def.key) && idByKey.has(def.key)).map((def) => ({
      module: idByKey.get(def.key)!,
      actions: ['read', ...(GRANTS[def.key] ?? [])],
    }));

    const role = (await Role.findOne({ roleName: TECHNICAL_COMMITTEE_ROLE_NAME })) ?? new Role({ roleName: TECHNICAL_COMMITTEE_ROLE_NAME, permissions: [] });
    const existing = role.permissions.map((p) => ({ module: String(p.module), actions: [...p.actions] }));
    role.permissions = normalizePermissions([...existing, ...wanted], await loadModuleInfo()) as any;
    await role.save();

    console.log(`🛡️  Role "${TECHNICAL_COMMITTEE_ROLE_NAME}" now has ${role.permissions.length} module grants.`);
    console.log('🎉 Technical Committee seed completed. Assign the role to users in User Management.\n');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Technical Committee seed error:', error.message || error);
    process.exit(1);
  }
};

seedTechnicalCommittee();
