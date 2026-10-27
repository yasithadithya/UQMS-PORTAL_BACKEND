import { Router } from 'express';
import authMiddleware from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getAllVesselTypes,
  getAllSurveyTypes,
  getAllAreaOperations,
  searchVesselTypesByGroup,
  searchSurveyTypes,
  searchAreaOperationsByCategory,
  updateSurveyTypeMapping,
  createSurveyType,
  updateSurveyType,
  deleteSurveyType,
  getSurveyTypeUsage,
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

/* ── Survey configuration (Admin → Survey Configuration) ── */

/**
 * @swagger
 * /api/operations/survey-types/usage:
 *   get:
 *     summary: How many requests, jobs and checklist questions use each survey type ({ [id]: counts })
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/survey-types/usage', requirePermission('admin.survey-config', 'read'), getSurveyTypeUsage);

/**
 * @swagger
 * /api/operations/survey-types:
 *   post:
 *     summary: Create a survey sub type ({ code, name, description?, sector, mainTypes[] })
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 */
router.post('/survey-types', requirePermission('admin.survey-config', 'create'), createSurveyType);

/**
 * @swagger
 * /api/operations/survey-types/{id}:
 *   put:
 *     summary: Update a survey sub type (any of code, name, description, sector, mainTypes[]). A sub type can belong to several main survey types.
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a survey sub type that no request, job or checklist question uses
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 */
router.put('/survey-types/:id', requirePermission('admin.survey-config', 'update'), updateSurveyType);
router.delete('/survey-types/:id', requirePermission('admin.survey-config', 'delete'), deleteSurveyType);

/**
 * @swagger
 * /api/operations/survey-types/{id}/mapping:
 *   patch:
 *     summary: Set the main survey types and sector of a survey sub type ({ mainTypes[], sector }; legacy { mainType } still accepted)
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/survey-types/:id/mapping', requirePermission('admin.survey-config', 'update'), updateSurveyTypeMapping);

export default router;
