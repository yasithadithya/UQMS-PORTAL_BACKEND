import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import User from '../models/User';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { login, password } = req.body;

    // Validate input
    if (!login || !password) {
      res.status(400).json({
        success: false,
        message: 'Username/email and password are required.',
      });
      return;
    }

    // Find user by email OR username and populate role
    const user = await User.findOne({
      $or: [{ email: login.toLowerCase() }, { username: login }],
    }).populate('role');

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found.',
      });
      return;
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
      return;
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET || 'fallback_secret';

    const signOptions: SignOptions = {
      expiresIn: '12h',
    };

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      secret,
      signOptions
    );

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error during login.',
      error: error.message,
    });
  }
};
