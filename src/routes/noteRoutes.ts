import { Router } from 'express';
import { getNotesByVesselId, upsertVesselNotes } from '../controllers/noteController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Protect all routes under Vessel Notes
router.use(authMiddleware);

/**
 * @swagger
 * /api/notes/vessel/{vesselId}:
 *   get:
 *     summary: Get notes for a vessel
 *     description: Retrieve the notes document (containing array of notes) for a specific vessel.
 *     tags: [Vessel Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vesselId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel ID
 *     responses:
 *       200:
 *         description: Notes document retrieved successfully
 *       400:
 *         description: Invalid Vessel ID
 *       401:
 *         description: Unauthorized
 */
router.get('/vessel/:vesselId', getNotesByVesselId);

/**
 * @swagger
 * /api/notes/vessel/{vesselId}:
 *   put:
 *     summary: Update notes for a vessel
 *     description: Create or update all notes for a vessel. Auto-generates noteCodes for new notes or notes with changed categories.
 *     tags: [Vessel Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vesselId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - notes
 *             properties:
 *               notes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - noteCategory
 *                     - description
 *                     - type
 *                   properties:
 *                     noteCategory:
 *                       type: string
 *                       enum: [Additional Information, Statutory Conditions]
 *                     noteCode:
 *                       type: string
 *                     description:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [Hull, Machinery, Equipment]
 *                     status:
 *                       type: string
 *                       enum: [new, modified, deleted, retained]
 *                     dueDate:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       200:
 *         description: Notes document updated successfully
 *       400:
 *         description: Invalid input or Vessel ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Vessel not found
 */
router.put('/vessel/:vesselId', upsertVesselNotes);

export default router;
