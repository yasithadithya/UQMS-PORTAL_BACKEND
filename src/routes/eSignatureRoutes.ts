import express from 'express';
import { getSignatureStatus, revokeSignature, signDocument } from '../controllers/eSignatureController';
import authMiddleware from '../middleware/auth';

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
 *     summary: Electronically sign a document (locks it). Assigned surveyors sign as themselves; admin and uqms-admin sign on an assigned surveyor's behalf
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
 *               signerId:
 *                 type: string
 *                 description: Assigned surveyor to sign as (admin and uqms-admin only; defaults to the most recent visit's surveyor)
 *     responses:
 *       200:
 *         description: Document signed and its PDF re-rendered with the signature stamp
 *       403:
 *         description: The user is not a surveyor assigned to the survey
 *       409:
 *         description: The document is already signed
 *   delete:
 *     summary: Revoke a document's electronic signature (admin or uqms-admin)
 *     tags: [E-Signatures]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signature revoked and the document unlocked
 */
router.post('/:docType/:id/sign', signDocument);
router.delete('/:docType/:id/sign', revokeSignature);

export default router;
