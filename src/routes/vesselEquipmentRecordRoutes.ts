import { Router } from 'express';
import {
  getEquipmentRecordBySurveyReportId,
  upsertEquipmentRecord,
} from '../controllers/vesselEquipmentRecordController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Secure all vessel equipment record routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/vessel-equipment-records/report/{surveyReportId}:
 *   get:
 *     summary: Get equipment record by Survey Report ID
 *     description: Retrieve the equipment record for a specific survey report. If it doesn't exist, returns a templated list of all questions.
 *     tags: [VesselEquipmentRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: surveyReportId
 *         required: true
 *         schema:
 *           type: string
 *         description: Survey Report ID
 *     responses:
 *       200:
 *         description: Equipment record details or templated questionnaire
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Survey Report not found
 *       401:
 *         description: Unauthorized
 */
router.get('/report/:surveyReportId', getEquipmentRecordBySurveyReportId);

/**
 * @swagger
 * /api/vessel-equipment-records/report/{surveyReportId}:
 *   post:
 *     summary: Create or update equipment record by Survey Report ID
 *     description: Upsert the equipment record answers for a specific survey report
 *     tags: [VesselEquipmentRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: surveyReportId
 *         required: true
 *         schema:
 *           type: string
 *         description: Survey Report ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vesselId
 *               - equipmentRecords
 *             properties:
 *               vesselId:
 *                 type: string
 *                 example: "60c72b2f9b1d8b2d1c8b4567"
 *               equipmentRecords:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - questionId
 *                     - status
 *                   properties:
 *                     questionId:
 *                       type: string
 *                       description: RecEquipQues ID
 *                       example: "60c72b2f9b1d8b2d1c8b4568"
 *                     status:
 *                       type: string
 *                       enum: [Provided, Not Provided, Not Applicable]
 *                       example: "Provided"
 *                     remarks:
 *                       type: string
 *                       example: "Found in good condition"
 *     responses:
 *       200:
 *         description: Vessel equipment record saved successfully
 *       400:
 *         description: Invalid input or ID format
 *       401:
 *         description: Unauthorized
 */
router.post('/report/:surveyReportId', upsertEquipmentRecord);

export default router;
