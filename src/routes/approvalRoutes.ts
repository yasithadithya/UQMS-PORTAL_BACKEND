import { Router } from 'express';
import authMiddleware from '../middleware/auth';
import { requireAny, requirePermission } from '../middleware/permission';
import {
  acceptApprovalRequest,
  createApprovalRequest,
  decideApprovalRequest,
  getApprovalRequests,
  getRevisionHistory,
} from '../controllers/approvalController';

/**
 * @swagger
 * tags:
 *   name: Approvals
 *   description: QMS change control. Every change is approved (level 1) and then accepted (level 2) before it takes effect.
 */
const router = Router();
router.use(authMiddleware);

/**
 * @swagger
 * /api/approvals:
 *   get:
 *     summary: List change requests (status may be comma-separated, entityType, entityId). Users without approvals access see their own.
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Propose a change ({ entityType, entityId?, operation, payload, requestComment }). Always starts as pending.
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', getApprovalRequests);
router.post('/', createApprovalRequest);

/**
 * @swagger
 * /api/approvals/history:
 *   get:
 *     summary: QMS revision history - every change request in every state (status, entityType, entityId, search)
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/history', requireAny(['qms', 'approvals'], ['read']), getRevisionHistory);

/**
 * @swagger
 * /api/approvals/{id}/decision:
 *   post:
 *     summary: Level 1 - approve or reject a pending change ({ decision, comment }). Comment required to reject. Sets the request date.
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/decision', requirePermission('approvals', 'approve'), decideApprovalRequest);

/**
 * @swagger
 * /api/approvals/{id}/acceptance:
 *   post:
 *     summary: Level 2 - accept (applies the change) or reject an approved change ({ decision, comment }). Comment required to reject. Sets the effective date.
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/acceptance', requirePermission('approvals', 'accept'), acceptApprovalRequest);

export default router;
