import { Router } from 'express';
import {
  createFirstEntry,
  getAllFirstEntries,
  getFirstEntryById,
  updateFirstEntry,
  deleteFirstEntry,
  createScheduleII,
  getScheduleIIById,
  updateScheduleII,
  deleteScheduleII,
  sendScheduleIIEmail,
} from '../controllers/firstEntryController';
import authMiddleware from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// All first entry routes are protected
router.use(authMiddleware);

// ==========================================
// FIRST ENTRY ROUTES
// ==========================================

/**
 * @swagger
 * /api/first-entries:
 *   post:
 *     summary: Create a new first entry
 *     tags: [First Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request
 *               - vessel
 *             properties:
 *               request:
 *                 type: string
 *               vessel:
 *                 type: string
 *               isQuoted:
 *                 type: boolean
 *               quotationNumber:
 *                 type: string
 *               quotationComments:
 *                 type: string
 *     responses:
 *       201:
 *         description: First entry created successfully
 */
router.post('/', requirePermission('marine.entries', 'create'), createFirstEntry);

/**
 * @swagger
 * /api/first-entries:
 *   get:
 *     summary: Get all first entries
 *     tags: [First Entries]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of first entries
 */
router.get('/', requirePermission('marine.entries', 'read'), getAllFirstEntries);

/**
 * @swagger
 * /api/first-entries/{id}:
 *   get:
 *     summary: Get first entry by ID
 *     tags: [First Entries]
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
 *         description: First entry found
 */
router.get('/:id', requirePermission('marine.entries', 'read'), getFirstEntryById);

/**
 * @swagger
 * /api/first-entries/{id}:
 *   put:
 *     summary: Update first entry
 *     tags: [First Entries]
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
 *             properties:
 *               request:
 *                 type: string
 *               vessel:
 *                 type: string
 *               isQuoted:
 *                 type: boolean
 *               quotationNumber:
 *                 type: string
 *               quotationComments:
 *                 type: string
 *     responses:
 *       200:
 *         description: First entry updated successfully
 */
router.put('/:id', requirePermission('marine.entries', 'update'), updateFirstEntry);

/**
 * @swagger
 * /api/first-entries/{id}:
 *   delete:
 *     summary: Delete first entry
 *     tags: [First Entries]
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
 *         description: First entry deleted successfully
 */
router.delete('/:id', requirePermission('marine.entries', 'delete'), deleteFirstEntry);

// ==========================================
// SCHEDULE II ROUTES
// ==========================================

/**
 * @swagger
 * /api/first-entries/schedule2:
 *   post:
 *     summary: Create a Schedule II entry
 *     tags: [Schedule II]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstEntryId
 *             properties:
 *               firstEntryId:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       201:
 *         description: Schedule II created successfully
 */
router.post('/schedule2', requirePermission('marine.entries', 'update'), createScheduleII);

/**
 * @swagger
 * /api/first-entries/schedule2/{scheduleId}:
 *   get:
 *     summary: Get Schedule II by ID
 *     tags: [Schedule II]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Schedule II found
 */
router.get('/schedule2/:scheduleId', requirePermission('marine.entries', 'read'), getScheduleIIById);

/**
 * @swagger
 * /api/first-entries/schedule2/{scheduleId}:
 *   put:
 *     summary: Update Schedule II
 *     tags: [Schedule II]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Schedule II updated successfully
 */
router.put('/schedule2/:scheduleId', requirePermission('marine.entries', 'update'), updateScheduleII);

/**
 * @swagger
 * /api/first-entries/schedule2/{scheduleId}:
 *   delete:
 *     summary: Delete Schedule II
 *     tags: [Schedule II]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Schedule II deleted successfully
 */
router.delete('/schedule2/:scheduleId', requirePermission('marine.entries', 'update'), deleteScheduleII);

/**
 * @swagger
 * /api/first-entries/schedule2/{scheduleId}/send-email:
 *   post:
 *     summary: Send Schedule II documents via email
 *     tags: [Schedule II]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email sent successfully
 */
router.post('/schedule2/:scheduleId/send-email', requirePermission('marine.entries', 'update'), sendScheduleIIEmail);

export default router;
