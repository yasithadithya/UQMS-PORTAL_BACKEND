import { Request, Response } from 'express';
import Role from '../models/Role';
import User from '../models/User';

// Create a new role
export const createRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleName, permissions } = req.body;

    if (!roleName) {
      res.status(400).json({
        success: false,
        message: 'Role name is required.',
      });
      return;
    }

    // Check if role already exists
    const existingRole = await Role.findOne({ roleName: roleName.toLowerCase() });
    if (existingRole) {
      res.status(409).json({
        success: false,
        message: 'Role with this name already exists.',
      });
      return;
    }

    const role = new Role({ roleName: roleName.toLowerCase(), permissions: permissions || [] });
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
export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleName, permissions } = req.body;

    if (!roleName) {
      res.status(400).json({
        success: false,
        message: 'Role name is required.',
      });
      return;
    }

    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { roleName: roleName.toLowerCase(), permissions: permissions || [] },
      { new: true, runValidators: true }
    );

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found.',
      });
      return;
    }

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
export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
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
