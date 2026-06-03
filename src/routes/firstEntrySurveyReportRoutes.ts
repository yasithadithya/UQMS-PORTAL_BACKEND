import { Router } from 'express';
import {
  createFirstEntrySurveyReport,
  getAllFirstEntrySurveyReports,
  getPrePopulatedReportDataByBookingId,
  getFirstEntrySurveyReportById,
  updateFirstEntrySurveyReport,
  deleteFirstEntrySurveyReport,
} from '../controllers/firstEntrySurveyReportController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Protect all routes under first entry survey reports
router.use(authMiddleware);

/**
 * @swagger
 * /api/first-entry-survey-reports:
 *   post:
 *     summary: Create a new first entry survey report
 *     tags: [First Entry Survey Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *             properties:
 *               bookingId:
 *                 type: string
 *                 description: The ID of the First Entry Survey Booking to link and pre-populate from.
 *               reportRemarks:
 *                 type: string
 *               anniversaryDate:
 *                 type: string
 *                 format: date
 *               surveys:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     surveyCategory:
 *                       type: string
 *                     surveyStatus:
 *                       type: string
 *                     isPostponed:
 *                       type: boolean
 *                     postponeDate:
 *                       type: string
 *                       format: date
 *                     surveyDate:
 *                       type: string
 *                       format: date
 *                     assignedDate:
 *                       type: string
 *                       format: date
 *                     dueFrom:
 *                       type: string
 *                       format: date
 *                     dueTo:
 *                       type: string
 *                       format: date
 *                     remarks:
 *                       type: string
 *     responses:
 *       201:
 *         description: Report created successfully
 *       400:
 *         description: Invalid input or missing fields
 *       404:
 *         description: Booking not found
 */
router.post('/', createFirstEntrySurveyReport);

/**
 * @swagger
 * /api/first-entry-survey-reports:
 *   get:
 *     summary: Get all first entry survey reports
 *     tags: [First Entry Survey Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of reports retrieved successfully
 */
router.get('/', getAllFirstEntrySurveyReports);

/**
 * @swagger
 * /api/first-entry-survey-reports/pre-populate/{bookingId}:
 *   get:
 *     summary: Get pre-populated report data from a booking ID without saving
 *     tags: [First Entry Survey Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the booking to pre-populate from.
 *     responses:
 *       200:
 *         description: Pre-populated report data generated successfully
 *       400:
 *         description: Invalid booking ID format
 *       404:
 *         description: Booking not found
 */
router.get('/pre-populate/:bookingId', getPrePopulatedReportDataByBookingId);

/**
 * @swagger
 * /api/first-entry-survey-reports/{id}:
 *   get:
 *     summary: Get first entry survey report by ID
 *     tags: [First Entry Survey Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report retrieved successfully
 *       400:
 *         description: Invalid report ID format
 *       404:
 *         description: Report not found
 */
router.get('/:id', getFirstEntrySurveyReportById);

/**
 * @swagger
 * /api/first-entry-survey-reports/{id}:
 *   put:
 *     summary: Update first entry survey report
 *     tags: [First Entry Survey Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Report updated successfully
 *       400:
 *         description: Invalid input or ID format
 *       404:
 *         description: Report not found
 */
router.put('/:id', updateFirstEntrySurveyReport);

/**
 * @swagger
 * /api/first-entry-survey-reports/{id}:
 *   delete:
 *     summary: Delete first entry survey report
 *     tags: [First Entry Survey Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report deleted successfully
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Report not found
 */
router.delete('/:id', deleteFirstEntrySurveyReport);

export default router;
