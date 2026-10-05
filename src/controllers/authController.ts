import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest, getJwtSecret } from '../middleware/auth';
import { audit } from '../services/auditService';

const failedLogin = (identifier: string, reason: string, user?: { _id: unknown; email?: string; role?: unknown }) =>
  audit.event({
    action: 'auth.login.failed',
    entityType: 'auth',
    entityId: user?._id,
    entityRef: String(identifier).slice(0, 100),
    outcome: 'failure',
    reason,
    actor: user ? { id: String(user._id), email: user.email, role: user.role } : {},
    metadata: { identifier: String(identifier).slice(0, 100) },
  });

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
      await failedLogin(login, 'Unknown username or email');
      res.status(401).json({
        success: false,
        message: 'User not found.',
      });
      return;
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      await failedLogin(login, 'Wrong password', user);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
      return;
    }

    // Generate JWT
    const secret = getJwtSecret();

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

    await audit.event({
      action: 'auth.login',
      entityType: 'auth',
      entityId: user._id,
      entityRef: user.username,
      actor: { id: String(user._id), email: user.email, role: user.role },
      metadata: { identifier: String(login).slice(0, 100) },
    });

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

/** Records a sign-out. The token itself is discarded by the client. */
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  await audit.event({ action: 'auth.logout', entityType: 'auth', entityId: req.user?.id, entityRef: req.user?.email }, req);
  res.status(200).json({ success: true, message: 'Signed out.' });
};
