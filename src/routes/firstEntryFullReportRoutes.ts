import { Router } from 'express';
import {
  getAllFirstEntryFullReports,
  getFirstEntryFullReportById,
  getFirstEntryFullReportBySurveyReportId,
  updateFirstEntryFullReport,
  deleteFirstEntryFullReport,
  triggerFullReportGeneration,
} from '../controllers/firstEntryFullReportController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Protect all routes under first entry full reports
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: First Entry Full Reports
 *   description: API to manage First Entry Full Reports
 */

/**
 * @swagger
 * /api/first-entry-full-reports:
 *   get:
 *     summary: Get all first entry full reports
 *     tags: [First Entry Full Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of full reports retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/', getAllFirstEntryFullReports);

/**
 * @swagger
 * /api/first-entry-full-reports/{id}:
 *   get:
 *     summary: Get a first entry full report by ID
 *     tags: [First Entry Full Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The full report ID
 *     responses:
 *       200:
 *         description: Full report retrieved successfully
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Full report not found
 *       500:
 *         description: Server error
 */
router.get('/:id', getFirstEntryFullReportById);

/**
 * @swagger
 * /api/first-entry-full-reports/survey-report/{surveyReportId}:
 *   get:
 *     summary: Get a first entry full report by survey report ID
 *     tags: [First Entry Full Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: surveyReportId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the associated first entry survey report
 *     responses:
 *       200:
 *         description: Full report retrieved successfully
 *       400:
 *         description: Invalid survey report ID format
 *       404:
 *         description: Full report not found for this survey report
 *       500:
 *         description: Server error
 */
router.get('/survey-report/:surveyReportId', getFirstEntryFullReportBySurveyReportId);

/**
 * @swagger
 * /api/first-entry-full-reports/{id}:
 *   put:
 *     summary: Update a first entry full report
 *     tags: [First Entry Full Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The full report ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               checklist:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - checklistQuestionId
 *                   properties:
 *                     checklistQuestionId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [satisfied, unsatisfied, N/A]
 *                     visitNumber:
 *                       type: string
 *                     surveyName:
 *                       type: string
 *                     surveyDate:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       200:
 *         description: Full report updated successfully
 *       400:
 *         description: Invalid input or ID format
 *       404:
 *         description: Full report not found
 *       500:
 *         description: Server error
 */
router.put('/:id', updateFirstEntryFullReport);

/**
 * @swagger
 * /api/first-entry-full-reports/{id}:
 *   delete:
 *     summary: Delete a first entry full report
 *     tags: [First Entry Full Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The full report ID
 *     responses:
 *       200:
 *         description: Full report deleted successfully
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Full report not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', deleteFirstEntryFullReport);

/**
 * @swagger
 * /api/first-entry-full-reports/generate/{surveyReportId}:
 *   post:
 *     summary: Manually trigger or regenerate a full report from a survey report ID
 *     tags: [First Entry Full Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: surveyReportId
 *         required: true
 *         schema:
 *           type: string
 *         description: The survey report ID
 *     responses:
 *       200:
 *         description: Full report generated successfully
 *       400:
 *         description: Invalid survey report ID format
 *       404:
 *         description: Survey report not found
 *       500:
 *         description: Server error
 */
router.post('/generate/:surveyReportId', triggerFullReportGeneration);

export default router;
