import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
// Primary-DB models — auth/RBAC data lives in the main app database
import Role from '../../models/Role';
import Module from '../../models/Module';

let cachedHrModuleId: string | null = null;

const getHrModuleId = async (): Promise<string | null> => {
  if (cachedHrModuleId) return cachedHrModuleId;
  const hrModule = await Module.findOne({ name: { $regex: /^hr$/i } });
  if (hrModule) cachedHrModuleId = String(hrModule._id);
  return cachedHrModuleId;
};

/**
 * HR admin = admin role, or a role with the `update` action on the HR module.
 * Users with only `read` on HR are ESS users and may only use the /me routes.
 */
const hrAdminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const tokenRole: any = req.user.role;
    const roleName = typeof tokenRole === 'object' && tokenRole !== null ? tokenRole.roleName : tokenRole;
    if (typeof roleName === 'string' && roleName.toLowerCase() === 'admin') {
      next();
      return;
    }

    // Re-check permissions against the database, not the (possibly stale) token
    const roleId = typeof tokenRole === 'object' && tokenRole !== null ? tokenRole._id : tokenRole;
    const [role, hrModuleId] = await Promise.all([
      roleId ? Role.findById(roleId) : null,
      getHrModuleId(),
    ]);

    const isHrAdmin = !!role && !!hrModuleId && role.permissions.some(
      (p) => String(p.module) === hrModuleId && p.actions.includes('update')
    );

    if (!isHrAdmin) {
      res.status(403).json({ success: false, message: 'Forbidden. HR admin access required.' });
      return;
    }

    next();
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default hrAdminMiddleware;
