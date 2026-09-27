import Module from '../models/Module';
import type { AuthRequest } from '../middleware/auth';

/** The role name that gets unrestricted access. This is the only place the name check lives. */
export const SUPER_ADMIN_ROLE_NAME = 'admin';

export interface TokenPermission {
  module: string | { _id: string };
  actions: string[];
}

export interface TokenRole {
  _id: string;
  roleName: string;
  permissions?: TokenPermission[];
}

export const roleNameOf = (role: unknown): string => {
  const name = role && typeof role === 'object' ? (role as { roleName?: unknown }).roleName : role;
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
};

export const isSuperAdmin = (role: unknown): boolean => roleNameOf(role) === SUPER_ADMIN_ROLE_NAME;

export const roleIdOf = (role: unknown): string => {
  if (role && typeof role === 'object') return String((role as { _id?: unknown })._id ?? '');
  return typeof role === 'string' ? role : '';
};

const permissionModuleId = (p: TokenPermission): string =>
  String(p.module && typeof p.module === 'object' ? p.module._id : p.module);

// ---------------------------------------------------------------------------
// Module cache (the module tree is small and changes rarely)
// ---------------------------------------------------------------------------

export interface CachedModule {
  id: string;
  key?: string;
  name: string;
  parentId: string | null;
  actions: string[];
  isSystem: boolean;
}

const CACHE_TTL_MS = 60_000;
interface ModuleCache {
  byId: Map<string, CachedModule>;
  byKey: Map<string, CachedModule>;
  loadedAt: number;
}

let cache: ModuleCache | null = null;
let loading: Promise<ModuleCache> | null = null;

export const invalidateModuleCache = (): void => {
  cache = null;
};

const loadModules = async (): Promise<ModuleCache> => {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  if (!loading) {
    loading = (async () => {
      const docs = await Module.find().select('name key parentId actions isSystem').lean();
      const byId = new Map<string, CachedModule>();
      const byKey = new Map<string, CachedModule>();
      for (const doc of docs) {
        const mod: CachedModule = {
          id: String(doc._id),
          key: doc.key || undefined,
          name: doc.name,
          parentId: doc.parentId ? String(doc.parentId) : null,
          actions: doc.actions || [],
          isSystem: !!doc.isSystem,
        };
        byId.set(mod.id, mod);
        if (mod.key) byKey.set(mod.key, mod);
      }
      const fresh: ModuleCache = { byId, byKey, loadedAt: Date.now() };
      cache = fresh;
      return fresh;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
};

export const getModuleByKey = async (key: string): Promise<CachedModule | undefined> => (await loadModules()).byKey.get(key);

export const getAllModules = async (): Promise<Map<string, CachedModule>> => (await loadModules()).byId;

/** Ids of a module's ancestors, nearest first. */
export const ancestorIdsOf = (moduleId: string, byId: Map<string, CachedModule>): string[] => {
  const result: string[] = [];
  let current = byId.get(moduleId)?.parentId ?? null;
  while (current && !result.includes(current) && result.length < 20) {
    result.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Permission checks against the role snapshot carried in the JWT
// ---------------------------------------------------------------------------

/** Whether the role grants `action` on the module with this id. */
export const roleHasAction = (role: unknown, moduleId: string, action: string): boolean => {
  if (isSuperAdmin(role)) return true;
  const permissions = (role as TokenRole | null)?.permissions;
  if (!Array.isArray(permissions)) return false;
  return permissions.some((p) => permissionModuleId(p) === moduleId && Array.isArray(p.actions) && p.actions.includes(action));
};

export const userCan = async (req: AuthRequest, key: string, action: string): Promise<boolean> => {
  const role = req.user?.role;
  if (!role) return false;
  if (isSuperAdmin(role)) return true;
  const mod = await getModuleByKey(key);
  return !!mod && roleHasAction(role, mod.id, action);
};

export const userCanAny = async (req: AuthRequest, keys: string[], actions: string[]): Promise<boolean> => {
  for (const key of keys) {
    for (const action of actions) {
      if (await userCan(req, key, action)) return true;
    }
  }
  return false;
};
