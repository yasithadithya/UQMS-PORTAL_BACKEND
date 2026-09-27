import Module from '../models/Module';
import Role from '../models/Role';
import { SYSTEM_MODULES, INITIAL_ROLE_GRANTS } from './permissionRegistry';
import { invalidateModuleCache } from '../utils/permissions';

const fingerprint = (perms: { module: unknown; actions: string[] }[]) =>
  JSON.stringify(perms.map((p) => `${String(p.module)}:${[...p.actions].sort().join(',')}`).sort());

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type ModuleInfo = { id: string; parentId: string | null; actions: string[] };

/**
 * Brings every role's permissions into a consistent shape:
 * - drops entries for modules that no longer exist,
 * - trims actions to those the module supports,
 * - any action on a module implies `read` on it and on all its ancestors (so the UI can reach it).
 */
export const normalizePermissions = (
  permissions: { module: unknown; actions: string[] }[],
  modules: Map<string, ModuleInfo>
): { module: string; actions: string[] }[] => {
  const result = new Map<string, Set<string>>();
  const grant = (moduleId: string, action: string) => {
    const mod = modules.get(moduleId);
    if (!mod || !mod.actions.includes(action)) return;
    if (!result.has(moduleId)) result.set(moduleId, new Set());
    result.get(moduleId)!.add(action);
  };

  for (const p of permissions) {
    const moduleId = String(p.module && typeof p.module === 'object' ? (p.module as any)._id : p.module);
    const mod = modules.get(moduleId);
    if (!mod) continue;
    const actions = (p.actions || []).filter((a) => mod.actions.includes(a));
    if (actions.length === 0) continue;
    for (const action of actions) grant(moduleId, action);
    grant(moduleId, 'read');
    let parent = mod.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      grant(parent, 'read');
      parent = modules.get(parent)?.parentId ?? null;
    }
  }

  return [...result.entries()].map(([module, actions]) => ({ module, actions: [...actions] }));
};

export const loadModuleInfo = async (): Promise<Map<string, ModuleInfo>> => {
  const docs = await Module.find().select('parentId actions').lean();
  return new Map(
    docs.map((d) => [String(d._id), { id: String(d._id), parentId: d.parentId ? String(d.parentId) : null, actions: d.actions || [] }])
  );
};

/**
 * Idempotent startup sync of the system modules defined in permissionRegistry:
 * adopts existing modules by name (backfilling their key), creates missing ones, and migrates
 * role permissions onto newly created sub-modules so nobody loses access.
 */
export const syncSystemModules = async (): Promise<void> => {
  try {
    const keyToId = new Map<string, string>();
    const created = new Set<string>();

    for (const def of SYSTEM_MODULES) {
      const parentId = def.parentKey ? keyToId.get(def.parentKey) ?? null : null;

      let mod = await Module.findOne({ key: def.key });
      if (!mod) {
        mod = await Module.findOne({
          $or: [{ key: { $exists: false } }, { key: null }],
          name: { $regex: new RegExp(`^${escapeRegex(def.name)}$`, 'i') },
        });
        if (mod) {
          mod.key = def.key;
          console.log(`🔑 Module "${mod.name}" adopted as system module "${def.key}".`);
        }
      }
      if (!mod) {
        mod = new Module({ name: def.name, description: def.description, order: def.order ?? 0 });
        mod.key = def.key;
        created.add(def.key);
        console.log(`🌱 Created system module "${def.name}" (${def.key}).`);
      }

      if (String(mod.parentId ?? '') !== String(parentId ?? '')) {
        console.log(`↪️  Moving system module "${mod.name}" under its registry parent.`);
      }
      mod.parentId = (parentId as any) ?? null;
      mod.isSystem = true;
      mod.navigable = def.navigable;
      mod.actions = [...def.actions];
      if (!mod.description) mod.description = def.description;
      await mod.save();
      keyToId.set(def.key, String(mod._id));
    }

    // Migrate permissions onto newly created sub-modules, then normalize every role.
    const roles = await Role.find();
    const modules = await loadModuleInfo();

    for (const role of roles) {
      const before = fingerprint(role.permissions);
      const perms: { module: unknown; actions: string[] }[] = role.permissions.map((p) => ({ module: String(p.module), actions: [...p.actions] }));

      for (const def of SYSTEM_MODULES) {
        if (!created.has(def.key) || !def.inheritFrom) continue;
        const sourceId = keyToId.get(def.inheritFrom);
        const source = perms.find((p) => p.module === sourceId);
        if (!source) continue;
        if (def.inheritRequires && !source.actions.includes(def.inheritRequires)) continue;
        perms.push({ module: keyToId.get(def.key)!, actions: source.actions.filter((a) => (def.actions as string[]).includes(a)) });
      }

      for (const grant of INITIAL_ROLE_GRANTS) {
        if (!created.has(grant.moduleKey) || role.roleName.toLowerCase() !== grant.roleName) continue;
        perms.push({ module: keyToId.get(grant.moduleKey)!, actions: [...grant.actions] });
      }

      const normalized = normalizePermissions(perms, modules);
      if (fingerprint(normalized) !== before) {
        role.permissions = normalized as any;
        await role.save();
        console.log(`🛡️  Updated permissions for role "${role.roleName}".`);
      }
    }

    invalidateModuleCache();
    console.log('✅ System modules and role permissions in sync.');
  } catch (error) {
    console.error('❌ Error syncing system modules:', error);
  }
};
