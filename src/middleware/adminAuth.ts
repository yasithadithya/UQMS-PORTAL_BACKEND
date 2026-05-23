import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

const adminAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  // The role in the token might be an object or a string depending on population
  const roleName = typeof req.user.role === 'object' && req.user.role !== null
    ? (req.user.role as any).roleName
    : req.user.role; // Fallback if it's somehow just a string or we missed it

  if (!roleName || typeof roleName !== 'string' || roleName.toLowerCase() !== 'admin') {
    res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
    return;
  }

  next();
};

export default adminAuthMiddleware;
