import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import Role from '../models/Role';
import { isSuperAdmin, userCan } from '../utils/permissions';

/** Whether the user with this id holds the super admin role. */
const targetIsSuperAdmin = async (userId: string): Promise<boolean> => {
  const target = await User.findById(userId).select('role').populate('role', 'roleName');
  return !!target && isSuperAdmin(target.role);
};

// Minimal user list (no contact details) for pickers such as surveyor assignment and HR account linking
export const getUserDirectory = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find()
      .select('username fullName nameWithInitials empNumber')
      .sort({ fullName: 1 })
      .lean();
    res.status(200).json({ success: true, count: users.length, data: users.map((u) => ({ ...u, id: String(u._id) })) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching user directory.', error: error.message });
  }
};

// Create a new user
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, email, password, role, fullName, nameWithInitials, phoneNumber, address, dob, empNumber } = req.body;

    // Check if role exists
    const roleExists = await Role.findById(role);
    if (!roleExists) {
      res.status(400).json({
        success: false,
        message: 'Invalid role ID. Role does not exist.',
      });
      return;
    }
    if (isSuperAdmin(roleExists) && !isSuperAdmin(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only a super admin can assign the admin role.' });
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'User with this email or username already exists.',
      });
      return;
    }

    const user = new User({
      username,
      email,
      password,
      role,
      fullName,
      nameWithInitials,
      phoneNumber,
      address,
      dob: dob ? new Date(dob) : null,
      empNumber
    });
    await user.save();

    // Return user without password
    const userResponse = await User.findById(user._id)
      .select('-password')
      .populate('role');

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: userResponse,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Duplicate field value. User already exists.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error creating user.',
      error: error.message,
    });
  }
};

// Get all users
export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users.',
      error: error.message,
    });
  }
};

// Get user by ID
export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.id !== req.params.id && !(await userCan(req, 'admin.users', 'read'))) {
      res.status(403).json({ success: false, message: 'You do not have permission to view this user.' });
      return;
    }

    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('role');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    if (error.kind === 'ObjectId') {
      res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error fetching user.',
      error: error.message,
    });
  }
};

// Update user
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, email, password, role, fullName, nameWithInitials, phoneNumber, address, dob, empNumber } = req.body;

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Forbidden. No authentication user details found.',
      });
      return;
    }

    const targetUserId = String(req.params.id);
    const currentUserId = req.user.id;

    const isSelf = currentUserId === targetUserId;
    const callerIsSuperAdmin = isSuperAdmin(req.user.role);
    const canManageUsers = await userCan(req, 'admin.users', 'update');

    if (!isSelf && !canManageUsers) {
      res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to update this user.',
      });
      return;
    }

    if (!isSelf && !callerIsSuperAdmin && (await targetIsSuperAdmin(targetUserId))) {
      res.status(403).json({ success: false, message: 'Only a super admin can edit an admin user.' });
      return;
    }

    const user = await User.findById(targetUserId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found.',
      });
      return;
    }

    // Role changes: never your own role, only with User Management rights, and only a super admin assigns admin.
    const roleChanged = !!role && String(role) !== String(user.role);
    if (roleChanged) {
      if (isSelf) {
        res.status(403).json({ success: false, message: 'You cannot change your own role.' });
        return;
      }
      if (!canManageUsers) {
        res.status(403).json({ success: false, message: 'Forbidden. You cannot change roles.' });
        return;
      }
      const roleExists = await Role.findById(role);
      if (!roleExists) {
        res.status(400).json({
          success: false,
          message: 'Invalid role ID. Role does not exist.',
        });
        return;
      }
      if (isSuperAdmin(roleExists) && !callerIsSuperAdmin) {
        res.status(403).json({ success: false, message: 'Only a super admin can assign the admin role.' });
        return;
      }
    }

    // Update fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (password) user.password = password; // Will be hashed by pre-save hook
    if (roleChanged) user.role = role;
    if (fullName !== undefined) user.fullName = fullName;
    if (nameWithInitials !== undefined) user.nameWithInitials = nameWithInitials;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (address !== undefined) user.address = address;
    if (dob !== undefined) user.dob = dob ? new Date(dob) : null;
    if (empNumber !== undefined) user.empNumber = empNumber;

    await user.save();

    // Return updated user without password
    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('role');

    res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      data: updatedUser,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Duplicate field value. Username or email already exists.',
      });
      return;
    }
    if (error.kind === 'ObjectId') {
      res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error updating user.',
      error: error.message,
    });
  }
};

// Delete user
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.id === req.params.id) {
      res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
      return;
    }
    if (!isSuperAdmin(req.user?.role) && (await targetIsSuperAdmin(String(req.params.id)))) {
      res.status(403).json({ success: false, message: 'Only a super admin can delete an admin user.' });
      return;
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully.',
    });
  } catch (error: any) {
    if (error.kind === 'ObjectId') {
      res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Error deleting user.',
      error: error.message,
    });
  }
};
