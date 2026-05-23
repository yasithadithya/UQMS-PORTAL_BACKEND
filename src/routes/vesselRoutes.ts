import { Router } from 'express';
import {
  createVessel,
  getAllVessels,
  getVesselById,
  updateVessel,
  deleteVessel,
  searchVessels,
} from '../controllers/vesselController';
import authMiddleware from '../middleware/auth';

const router = Router();

// All vessel routes are protected
router.use(authMiddleware);

/**
 * @swagger
 * /api/vessels:
 *   post:
 *     summary: Create a new vessel
 *     description: Create a new vessel with relevant details
 *     tags: [Vessels]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vesselName
 *             properties:
 *               vesselName:
 *                 type: string
 *               imoNumber:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vessel created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/', createVessel);

/**
 * @swagger
 * /api/vessels:
 *   get:
 *     summary: Get all vessels
 *     description: Retrieve all vessels with populated references
 *     tags: [Vessels]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of vessels
 *       401:
 *         description: Unauthorized
 */
router.get('/', getAllVessels);

/**
 * @swagger
 * /api/vessels/search:
 *   get:
 *     summary: Search vessels
 *     description: Search vessels by uqms number or vessel name
 *     tags: [Vessels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term for uqms number or vessel name
 *     responses:
 *       200:
 *         description: List of matched vessels
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/search', searchVessels);

/**
 * @swagger
 * /api/vessels/{id}:
 *   get:
 *     summary: Get vessel by ID
 *     description: Retrieve a single vessel by their ID
 *     tags: [Vessels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel ID
 *     responses:
 *       200:
 *         description: Vessel found
 *       404:
 *         description: Vessel not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', getVesselById);

/**
 * @swagger
 * /api/vessels/{id}:
 *   put:
 *     summary: Update vessel
 *     description: Update vessel fields
 *     tags: [Vessels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               vesselName:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Vessel updated successfully
 *       404:
 *         description: Vessel not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', updateVessel);

/**
 * @swagger
 * /api/vessels/{id}:
 *   delete:
 *     summary: Delete vessel
 *     description: Delete a vessel by their ID
 *     tags: [Vessels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel ID
 *     responses:
 *       200:
 *         description: Vessel deleted successfully
 *       404:
 *         description: Vessel not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', deleteVessel);

export default router;
