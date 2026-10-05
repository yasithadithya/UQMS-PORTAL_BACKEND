import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';

/**
 * Per-request context used by the audit trail. It lets code that has no access to `req`
 * (Mongoose hooks, services) know who is acting and from where.
 */
export interface AuditContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  user?: AuthRequest['user'];
  /** Set for work not triggered by a signed-in user, e.g. 'permission-sync' or 'website'. */
  system?: string;
  /** When true, the audit plugin records nothing (used for bulk internal housekeeping). */
  skipAudit?: boolean;
}

const storage = new AsyncLocalStorage<AuditContext>();

/** Express middleware: opens a fresh audit context for every request. Mount after the body parsers. */
export const requestContext = (req: Request, _res: Response, next: NextFunction): void => {
  storage.run(
    {
      requestId: randomUUID(),
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      method: req.method,
      path: req.originalUrl.split('?')[0],
    },
    () => next()
  );
};

export const getAuditContext = (): AuditContext | undefined => storage.getStore();

/** Called by authMiddleware once the token is verified. */
export const setContextUser = (user: AuthRequest['user']): void => {
  const store = storage.getStore();
  if (store) store.user = user;
};

/** Marks the current request as coming from a non-user source (e.g. the public website). */
export const setContextSystem = (label: string): void => {
  const store = storage.getStore();
  if (store) store.system = label;
};

/** Runs `fn` as a system actor, e.g. startup jobs and seed scripts. */
export const runAsSystem = <T>(label: string, fn: () => Promise<T>): Promise<T> =>
  storage.run({ requestId: randomUUID(), system: label }, fn);

/** Runs `fn` with automatic auditing switched off. */
export const withoutAudit = <T>(fn: () => Promise<T>): Promise<T> =>
  storage.run({ ...(storage.getStore() ?? { requestId: randomUUID() }), skipAudit: true }, fn);
