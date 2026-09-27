import { Response, NextFunction, RequestHandler } from 'express';
import { AuthRequest } from './auth';
import { getModuleByKey, userCan, userCanAny } from '../utils/permissions';

const METHOD_ACTIONS: Record<string, string> = {
  GET: 'read',
  HEAD: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

const forbid = async (res: Response, key: string, action: string): Promise<void> => {
  const mod = await getModuleByKey(key).catch(() => undefined);
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} ${mod?.name ?? key}.`,
  });
};

const guard = (check: (req: AuthRequest) => Promise<boolean>, describe: (req: AuthRequest) => [string, string]): RequestHandler =>
  (async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      if (await check(req)) {
        next();
        return;
      }
      const [key, action] = describe(req);
      await forbid(res, key, action);
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Error checking permissions.', error: error.message });
    }
  }) as RequestHandler;

/** Requires `action` on the module with this key. */
export const requirePermission = (key: string, action: string): RequestHandler =>
  guard((req) => userCan(req, key, action), () => [key, action]);

/** Requires at least one of `actions` on at least one of the modules. */
export const requireAny = (keys: string[], actions: string[]): RequestHandler =>
  guard((req) => userCanAny(req, keys, actions), () => [keys[0], actions[0]]);

/** Maps the HTTP method to an action (GET=read, POST=create, PUT/PATCH=update, DELETE=delete) on this module. */
export const crudByMethod = (key: string): RequestHandler =>
  guard(
    (req) => userCan(req, key, METHOD_ACTIONS[req.method] ?? 'update'),
    (req) => [key, METHOD_ACTIONS[req.method] ?? 'update']
  );

/**
 * For checks that depend on the request body (e.g. approvals). Sends a 403 and returns true when
 * the user lacks `action` on the module; returns false when the caller may continue.
 */
export const rejectUnlessCan = async (req: AuthRequest, res: Response, key: string, action: string): Promise<boolean> => {
  if (await userCan(req, key, action)) return false;
  await forbid(res, key, action);
  return true;
};
