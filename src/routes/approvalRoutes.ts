import { Router } from 'express';
import authMiddleware from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { createApprovalRequest, decideApprovalRequest, getApprovalRequests } from '../controllers/approvalController';

/**
 * @swagger
 * tags:
 *   name: Approvals
 *   description: QMS change approvals (checklist questions; forms, SOPs and JDs later)
 */
const router = Router();
router.use(authMiddleware);

/**
 * @swagger
 * /api/approvals:
 *   get:
 *     summary: List proposed changes (status, entityType, entityId). Users without approvals access see their own.
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Propose a change ({ entityType, entityId?, operation, payload }). Approvers' changes apply immediately.
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', getApprovalRequests);
router.post('/', createApprovalRequest);

/**
 * @swagger
 * /api/approvals/{id}/decision:
 *   post:
 *     summary: Approve (applies the change) or reject ({ decision, reason })
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/decision', requirePermission('approvals', 'approve'), decideApprovalRequest);

export default router;
