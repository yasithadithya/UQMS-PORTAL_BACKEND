import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Role from '../models/Role';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { loadModuleInfo, normalizePermissions } from '../config/seedModules';
import { SUPER_ADMIN_ROLE_NAME, isSuperAdmin, roleHasAction, roleIdOf } from '../utils/permissions';

type PermissionInput = { module: string; actions: string[] }[];

/**
 * Validates and normalizes a permissions payload, and blocks privilege escalation: a caller who is
 * not super admin may only grant actions they hold themselves. Grants the role already had are kept.
 * Returns the permissions to store, or sends an error response and returns null.
 */
const preparePermissions = async (
  req: AuthRequest,
  res: Response,
  input: unknown,
  existing: { module: unknown; actions: string[] }[] = []
): Promise<PermissionInput | null> => {
  if (input !== undefined && !Array.isArray(input)) {
    res.status(400).json({ success: false, message: 'Permissions must be an array.' });
    return null;
  }
  const raw = (input as any[] | undefined) ?? [];
  const modules = await loadModuleInfo();

  for (const p of raw) {
    const moduleId = String(p?.module ?? '');
    if (!mongoose.isValidObjectId(moduleId) || !modules.has(moduleId)) {
      res.status(400).json({ success: false, message: `Unknown module in permissions: ${moduleId || '(empty)'}.` });
      return null;
    }
    if (!Array.isArray(p.actions)) {
      res.status(400).json({ success: false, message: 'Each permission must have an actions array.' });
      return null;
    }
  }

  const normalized = normalizePermissions(raw.map((p) => ({ module: String(p.module), actions: p.actions })), modules);

  if (!isSuperAdmin(req.user?.role)) {
    const had = new Set(
      existing.flatMap((e) => {
        const id = String(e.module && typeof e.module === 'object' ? (e.module as any)._id : e.module);
        return (e.actions ?? []).map((a) => `${id}:${a}`);
      })
    );
    for (const p of normalized) {
      for (const action of p.actions) {
        if (!had.has(`${p.module}:${action}`) && !roleHasAction(req.user?.role, p.module, action)) {
          res.status(403).json({ success: false, message: 'You cannot grant permissions that you do not hold yourself.' });
          return null;
        }
      }
    }
  }

  return normalized;
};

// Create a new role
export const createRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roleName, permissions } = req.body;

    if (!roleName || typeof roleName !== 'string' || !roleName.trim()) {
      res.status(400).json({
        success: false,
        message: 'Role name is required.',
      });
      return;
    }

    const normalizedName = roleName.trim().toLowerCase();
    if (normalizedName === SUPER_ADMIN_ROLE_NAME) {
      res.status(400).json({ success: false, message: `The role name "${SUPER_ADMIN_ROLE_NAME}" is reserved.` });
      return;
    }

    // Check if role already exists
    const existingRole = await Role.findOne({ roleName: normalizedName });
    if (existingRole) {
      res.status(409).json({
        success: false,
        message: 'Role with this name already exists.',
      });
      return;
    }

    const preparedPermissions = await preparePermissions(req, res, permissions);
    if (!preparedPermissions) return;

    const role = new Role({ roleName: normalizedName, permissions: preparedPermissions });
    await role.save();

    res.status(201).json({
      success: true,
      message: 'Role created successfully.',
      data: role,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Role already exists.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error creating role.',
      error: error.message,
    });
  }
};

// Get all roles
export const getAllRoles = async (_req: Request, res: Response): Promise<void> => {
  try {
    const roles = await Role.find().sort({ createdAt: -1 }).populate('permissions.module');

    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching roles.',
      error: error.message,
    });
  }
};

// Get role by ID
export const getRoleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await Role.findById(req.params.id).populate('permissions.module');

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: role,
    });
  } catch (error: any) {
    if (error.kind === 'ObjectId') {
      res.status(400).json({
        success: false,
        message: 'Invalid role ID format.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error fetching role.',
      error: error.message,
    });
  }
};

// Update role
export const updateRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roleName, permissions } = req.body;

    if (!roleName || typeof roleName !== 'string' || !roleName.trim()) {
      res.status(400).json({
        success: false,
        message: 'Role name is required.',
      });
      return;
    }

    const role = await Role.findById(req.params.id);
    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found.',
      });
      return;
    }

    const normalizedName = roleName.trim().toLowerCase();
    const callerIsSuperAdmin = isSuperAdmin(req.user?.role);
    const targetIsSuperAdmin = role.roleName.toLowerCase() === SUPER_ADMIN_ROLE_NAME;

    if (targetIsSuperAdmin && normalizedName !== SUPER_ADMIN_ROLE_NAME) {
      res.status(400).json({ success: false, message: `The "${SUPER_ADMIN_ROLE_NAME}" role cannot be renamed.` });
      return;
    }
    if (!targetIsSuperAdmin && normalizedName === SUPER_ADMIN_ROLE_NAME) {
      res.status(400).json({ success: false, message: `The role name "${SUPER_ADMIN_ROLE_NAME}" is reserved.` });
      return;
    }
    if (targetIsSuperAdmin && !callerIsSuperAdmin) {
      res.status(403).json({ success: false, message: `Only a super admin can edit the "${SUPER_ADMIN_ROLE_NAME}" role.` });
      return;
    }
    if (!callerIsSuperAdmin && roleIdOf(req.user?.role) === String(role._id)) {
      res.status(403).json({ success: false, message: 'You cannot change the permissions of your own role.' });
      return;
    }

    const preparedPermissions = await preparePermissions(req, res, permissions, role.permissions);
    if (!preparedPermissions) return;

    role.roleName = normalizedName;
    role.permissions = preparedPermissions as any;
    await role.save();

    res.status(200).json({
      success: true,
      message: 'Role updated successfully.',
      data: role,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Role with this name already exists.',
      });
      return;
    }
    if (error.kind === 'ObjectId') {
      res.status(400).json({
        success: false,
        message: 'Invalid role ID format.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error updating role.',
      error: error.message,
    });
  }
};

// Delete role
export const deleteRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const target = await Role.findById(req.params.id).select('roleName');
    if (!target) {
      res.status(404).json({ success: false, message: 'Role not found.' });
      return;
    }
    if (target.roleName.toLowerCase() === SUPER_ADMIN_ROLE_NAME) {
      res.status(400).json({ success: false, message: `The "${SUPER_ADMIN_ROLE_NAME}" role cannot be deleted.` });
      return;
    }
    if (roleIdOf(req.user?.role) === String(target._id)) {
      res.status(403).json({ success: false, message: 'You cannot delete your own role.' });
      return;
    }

    // Check if any users are using this role
    const usersWithRole = await User.countDocuments({ role: req.params.id });
    if (usersWithRole > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role.`,
      });
      return;
    }

    const role = await Role.findByIdAndDelete(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully.',
    });
  } catch (error: any) {
    if (error.kind === 'ObjectId') {
      res.status(400).json({
        success: false,
        message: 'Invalid role ID format.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error deleting role.',
      error: error.message,
    });
  }
};
