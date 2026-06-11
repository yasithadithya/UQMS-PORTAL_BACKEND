import { Router } from 'express';
import {
  getAllVesselCodes,
  getVesselCodeById,
  createVesselCode,
  updateVesselCode,
  deleteVesselCode,
} from '../controllers/vesselCodeController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Secure all vessel code routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/vessel-codes:
 *   get:
 *     summary: Get all vessel codes
 *     description: Retrieve all vessel codes sorted alphabetically
 *     tags: [VesselCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of vessel codes
 *       401:
 *         description: Unauthorized
 */
router.get('/', getAllVesselCodes);

/**
 * @swagger
 * /api/vessel-codes/{id}:
 *   get:
 *     summary: Get vessel code by ID
 *     description: Retrieve a single vessel code by ID
 *     tags: [VesselCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel code ID
 *     responses:
 *       200:
 *         description: Vessel code details
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Vessel code not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', getVesselCodeById);

/**
 * @swagger
 * /api/vessel-codes:
 *   post:
 *     summary: Create a new vessel code
 *     description: Create a new vessel code with a unique code and description
 *     tags: [VesselCodes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - description
 *             properties:
 *               code:
 *                 type: string
 *                 example: VC01
 *               description:
 *                 type: string
 *                 example: Bulk Carrier Code 01
 *     responses:
 *       201:
 *         description: Vessel code created successfully
 *       400:
 *         description: Bad request
 *       409:
 *         description: Vessel code already exists
 *       401:
 *         description: Unauthorized
 */
router.post('/', createVesselCode);

/**
 * @swagger
 * /api/vessel-codes/{id}:
 *   put:
 *     summary: Update vessel code
 *     description: Update an existing vessel code's details
 *     tags: [VesselCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel code ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 example: VC01-UPDATED
 *               description:
 *                 type: string
 *                 example: Updated Bulk Carrier Code 01
 *     responses:
 *       200:
 *         description: Vessel code updated successfully
 *       400:
 *         description: Bad request or invalid ID format
 *       404:
 *         description: Vessel code not found
 *       409:
 *         description: Vessel code already exists
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', updateVesselCode);

/**
 * @swagger
 * /api/vessel-codes/{id}:
 *   delete:
 *     summary: Delete vessel code
 *     description: Delete a vessel code by ID
 *     tags: [VesselCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel code ID
 *     responses:
 *       200:
 *         description: Vessel code deleted successfully
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Vessel code not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', deleteVesselCode);

export default router;
