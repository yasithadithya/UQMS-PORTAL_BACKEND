import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { TokenRole } from '../utils/permissions';

// Extend Express Request to include user data
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    /** Snapshot of the user's role (with its permissions) taken at login. */
    role: TokenRole;
  };
}

/** The JWT signing secret. There is deliberately no fallback: a missing secret must stop the server. */
export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set.');
  return secret;
};

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as {
      id: string;
      email: string;
      role: TokenRole;
    };

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
};

export default authMiddleware;
