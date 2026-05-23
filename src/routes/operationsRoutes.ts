import { Router } from 'express';
import authMiddleware from '../middleware/auth';
import {
  getAllVesselTypes,
  getAllSurveyTypes,
  getAllAreaOperations,
  searchVesselTypesByGroup,
  searchSurveyTypes,
  searchAreaOperationsByCategory,
} from '../controllers/operationsController';

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * /api/operations/vessel-types:
 *   get:
 *     summary: Get all vessel types
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of vessel types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VesselType'
 *       401:
 *         description: Unauthorized
 */
router.get('/vessel-types', getAllVesselTypes);

/**
 * @swagger
 * /api/operations/survey-types:
 *   get:
 *     summary: Get all survey types
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of survey types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SurveyType'
 *       401:
 *         description: Unauthorized
 */
router.get('/survey-types', getAllSurveyTypes);

/**
 * @swagger
 * /api/operations/area-operations:
 *   get:
 *     summary: Get all area operations
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of area operations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AreaOfOperation'
 *       401:
 *         description: Unauthorized
 */
router.get('/area-operations', getAllAreaOperations);

/**
 * @swagger
 * /api/operations/vessel-types/search:
 *   get:
 *     summary: Search vessel types by group
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: group
 *         required: true
 *         schema:
 *           type: string
 *         description: Group filter
 *     responses:
 *       200:
 *         description: Matching vessel types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VesselType'
 *       400:
 *         description: Missing group query parameter
 *       401:
 *         description: Unauthorized
 */
router.get('/vessel-types/search', searchVesselTypesByGroup);

/**
 * @swagger
 * /api/operations/survey-types/search:
 *   get:
 *     summary: Search survey types by code or name
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Survey type code
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Survey type name
 *     responses:
 *       200:
 *         description: Matching survey types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SurveyType'
 *       400:
 *         description: Missing code or name query parameter
 *       401:
 *         description: Unauthorized
 */
router.get('/survey-types/search', searchSurveyTypes);

/**
 * @swagger
 * /api/operations/area-operations/search:
 *   get:
 *     summary: Search area operations by category
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: areaCategory
 *         required: true
 *         schema:
 *           type: string
 *         description: Area category filter
 *     responses:
 *       200:
 *         description: Matching area operations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AreaOfOperation'
 *       400:
 *         description: Missing areaCategory query parameter
 *       401:
 *         description: Unauthorized
 */
router.get('/area-operations/search', searchAreaOperationsByCategory);

export default router;
