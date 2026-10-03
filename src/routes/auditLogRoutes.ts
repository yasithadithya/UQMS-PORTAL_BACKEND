import { Router, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import AuditLog from '../models/AuditLog';
import { paginate } from '../utils/pagination';

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: List audit log entries (newest first)
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema: { type: string }
 *       - in: query
 *         name: entityId
 *         schema: { type: string }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated audit entries
 */
router.get('/', requirePermission('admin.audit-log', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.entityType === 'string' && req.query.entityType) query.entityType = req.query.entityType;
    if (typeof req.query.action === 'string' && req.query.action) query.action = req.query.action;
    if (typeof req.query.entityId === 'string' && req.query.entityId) {
      if (!mongoose.isValidObjectId(req.query.entityId)) {
        res.status(400).json({ success: false, message: 'Invalid entityId.' });
        return;
      }
      query.entityId = req.query.entityId;
    }
    const result = await paginate(AuditLog, query, req, [{ path: 'user', select: 'username fullName email' }]);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching audit log.', error: error.message });
  }
});

export default router;
