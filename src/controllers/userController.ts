import { Request, Response } from 'express';
import User from '../models/User';
import Role from '../models/Role';

// Create a new user
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password, role } = req.body;

    // Check if role exists
    const roleExists = await Role.findById(role);
    if (!roleExists) {
      res.status(400).json({
        success: false,
        message: 'Invalid role ID. Role does not exist.',
      });
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

    const user = new User({ username, email, password, role });
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
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
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
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password, role } = req.body;

    // If role is being updated, verify it exists
    if (role) {
      const roleExists = await Role.findById(role);
      if (!roleExists) {
        res.status(400).json({
          success: false,
          message: 'Invalid role ID. Role does not exist.',
        });
        return;
      }
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found.',
      });
      return;
    }

    // Update fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (password) user.password = password; // Will be hashed by pre-save hook
    if (role) user.role = role;

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
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
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
