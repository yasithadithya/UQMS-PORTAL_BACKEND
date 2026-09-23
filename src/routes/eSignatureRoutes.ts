import express from 'express';
import { getSignatureStatus, revokeSignature, signDocument } from '../controllers/eSignatureController';
import authMiddleware from '../middleware/auth';
import adminAuthMiddleware from '../middleware/adminAuth';

const router = express.Router();

router.use(authMiddleware);

/**
 * @swagger
 * /api/e-signatures/{docType}/{id}:
 *   get:
 *     summary: Get a document's electronic signature status and signature field position
 *     tags: [E-Signatures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [survey-report, docking-cert, scccos, daily-report]
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Signature status, including whether the current user can sign
 */
router.get('/:docType/:id', getSignatureStatus);

/**
 * @swagger
 * /api/e-signatures/{docType}/{id}/sign:
 *   post:
 *     summary: Electronically sign a document as the assigned surveyor (locks the document)
 *     tags: [E-Signatures]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: string
 *                 example: COLOMBO, SRI LANKA
 *     responses:
 *       200:
 *         description: Document signed and its PDF re-rendered with the signature stamp
 *       403:
 *         description: The user is not a surveyor assigned to the survey
 *       409:
 *         description: The document is already signed
 *   delete:
 *     summary: Revoke a document's electronic signature (admin only)
 *     tags: [E-Signatures]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signature revoked and the document unlocked
 */
router.post('/:docType/:id/sign', signDocument);
router.delete('/:docType/:id/sign', adminAuthMiddleware, revokeSignature);

export default router;
