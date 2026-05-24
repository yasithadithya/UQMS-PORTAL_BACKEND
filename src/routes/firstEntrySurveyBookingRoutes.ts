import { Router } from 'express';
import {
  createFirstEntrySurveyBooking,
  getAllFirstEntrySurveyBookings,
  getFirstEntrySurveyBookingById,
  updateFirstEntrySurveyBooking,
  deleteFirstEntrySurveyBooking,
} from '../controllers/firstEntrySurveyBookingController';
import authMiddleware from '../middleware/auth';

const router = Router();

// All first entry survey booking routes are protected
router.use(authMiddleware);

/**
 * @swagger
 * /api/first-entry-survey-bookings:
 *   post:
 *     summary: Create a new first entry survey booking
 *     tags: [First Entry Survey Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shipName
 *             properties:
 *               shipName:
 *                 type: string
 *               vesselId:
 *                 type: string
 *               uqmsNo:
 *                 type: string
 *               requestedDate:
 *                 type: string
 *                 format: date-time
 *               surveyMode:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully
 */
router.post('/', createFirstEntrySurveyBooking);

/**
 * @swagger
 * /api/first-entry-survey-bookings:
 *   get:
 *     summary: Get all first entry survey bookings
 *     tags: [First Entry Survey Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bookings
 */
router.get('/', getAllFirstEntrySurveyBookings);

/**
 * @swagger
 * /api/first-entry-survey-bookings/{id}:
 *   get:
 *     summary: Get first entry survey booking by ID
 *     tags: [First Entry Survey Bookings]
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
 *         description: Booking found
 *       404:
 *         description: Booking not found
 */
router.get('/:id', getFirstEntrySurveyBookingById);

/**
 * @swagger
 * /api/first-entry-survey-bookings/{id}:
 *   put:
 *     summary: Update first entry survey booking
 *     tags: [First Entry Survey Bookings]
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
 *         description: Booking updated successfully
 *       404:
 *         description: Booking not found
 */
router.put('/:id', updateFirstEntrySurveyBooking);

/**
 * @swagger
 * /api/first-entry-survey-bookings/{id}:
 *   delete:
 *     summary: Delete first entry survey booking
 *     tags: [First Entry Survey Bookings]
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
 *         description: Booking deleted successfully
 *       404:
 *         description: Booking not found
 */
router.delete('/:id', deleteFirstEntrySurveyBooking);

export default router;
