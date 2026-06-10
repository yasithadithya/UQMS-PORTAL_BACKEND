import { Router } from 'express';
import {
  createChecklistQuestion,
  getAllChecklistQuestions,
  getChecklistQuestionById,
  updateChecklistQuestion,
  deleteChecklistQuestion,
} from '../controllers/checklistQuestionController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Protect all checklist questions routes
router.use(authMiddleware);

/**
 * @swagger
 * components:
 *   schemas:
 *     ChecklistQuestion:
 *       type: object
 *       required:
 *         - item
 *         - surveyCategories
 *       properties:
 *         id:
 *           type: string
 *           description: Auto-generated MongoDB ObjectId of the checklist question
 *         item:
 *           type: string
 *           description: The text of the checklist item
 *         description:
 *           type: string
 *           description: Detailed description of the checklist item
 *         additionalFields:
 *           type: array
 *           items:
 *             type: string
 *             enum: [Qty, Capacity, Model or Serial Number]
 *           description: Custom input fields required for the item when filling reports
 *         surveyCategories:
 *           type: array
 *           items:
 *             type: string
 *           description: Reference IDs of the associated SurveyTypes
 *         lengths:
 *           type: array
 *           items:
 *             type: string
 *           description: Applicable vessel length ranges (e.g. "0-10m", "10-20m")
 *         areaOfOperations:
 *           type: array
 *           items:
 *             type: string
 *           description: Reference IDs of the associated AreaOfOperations
 *         boatTypes:
 *           type: array
 *           items:
 *             type: string
 *           description: Reference IDs of the associated VesselTypes/BoatTypes
 *         vesselCode:
 *           type: string
 *           description: Vessel code (optional)
 *         qCategory:
 *           type: string
 *           description: Question category (optional)
 *         createdBy:
 *           type: string
 *           description: User ID who created the question
 *         updatedBy:
 *           type: string
 *           description: User ID who last updated the question
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/checklist-questions:
 *   post:
 *     summary: Create a new checklist question with multiple associations
 *     tags: [Checklist Questions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - item
 *               - surveyCategories
 *             properties:
 *               item:
 *                 type: string
 *                 example: "Lifeboats"
 *               description:
 *                 type: string
 *                 example: "Ensure all lifeboats are fully equipped and functional."
 *               additionalFields:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Qty, Capacity, Model or Serial Number]
 *                 example: ["Qty", "Capacity"]
 *               surveyCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of SurveyType IDs (required)
 *                 example: ["65cb7b09be87a0c8680327bd"]
 *               lengths:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of applicable vessel length ranges (optional)
 *                 example: ["0-10m", "10-20m"]
 *               areaOfOperations:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of AreaOfOperation IDs (optional)
 *                 example: ["65cb7b09be87a0c8680327be"]
 *               boatTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of VesselType IDs (optional)
 *                 example: ["65cb7b09be87a0c8680327bf"]
 *               vesselCode:
 *                 type: string
 *                 description: Vessel code (optional)
 *                 example: "VC-01"
 *               qCategory:
 *                 type: string
 *                 description: Question category (optional)
 *                 example: "HULL"
 *     responses:
 *       201:
 *         description: Checklist question created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ChecklistQuestion'
 *       400:
 *         description: Validation error or missing required fields
 *       401:
 *         description: Unauthorized - missing or invalid auth token
 *       500:
 *         description: Internal server error
 */
router.post('/', createChecklistQuestion);

/**
 * @swagger
 * /api/checklist-questions:
 *   get:
 *     summary: Get all checklist questions
 *     tags: [Checklist Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional query term to search questions text
 *       - in: query
 *         name: surveyCategory
 *         schema:
 *           type: string
 *         description: Filter by SurveyType ID (or comma-separated list of IDs)
 *       - in: query
 *         name: areaOfOperation
 *         schema:
 *           type: string
 *         description: Filter by AreaOfOperation ID (or comma-separated list of IDs)
 *       - in: query
 *         name: boatType
 *         schema:
 *           type: string
 *         description: Filter by VesselType ID (or comma-separated list of IDs)
 *       - in: query
 *         name: length
 *         schema:
 *           type: string
 *         description: Filter by vessel length (or comma-separated list of numeric values)
 *       - in: query
 *         name: vesselCode
 *         schema:
 *           type: string
 *         description: Filter by vessel code (optional)
 *       - in: query
 *         name: qCategory
 *         schema:
 *           type: string
 *         description: Filter by question category (optional)
 *     responses:
 *       200:
 *         description: List of checklist questions
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
 *                     $ref: '#/components/schemas/ChecklistQuestion'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', getAllChecklistQuestions);

/**
 * @swagger
 * /api/checklist-questions/{id}:
 *   get:
 *     summary: Get checklist question by ID
 *     tags: [Checklist Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Checklist question ID
 *     responses:
 *       200:
 *         description: Checklist question details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ChecklistQuestion'
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Checklist question not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getChecklistQuestionById);

/**
 * @swagger
 * /api/checklist-questions/{id}:
 *   put:
 *     summary: Update checklist question fields by ID
 *     tags: [Checklist Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Checklist question ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             properties:
 *               item:
 *                 type: string
 *               description:
 *                 type: string
 *               additionalFields:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Qty, Capacity, Model or Serial Number]
 *               surveyCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *               lengths:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *               areaOfOperations:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *               boatTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *               vesselCode:
 *                 type: string
 *                 nullable: true
 *               qCategory:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Checklist question updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ChecklistQuestion'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Checklist question not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/:id', updateChecklistQuestion);

/**
 * @swagger
 * /api/checklist-questions/{id}:
 *   delete:
 *     summary: Delete a checklist question by ID
 *     tags: [Checklist Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Checklist question ID
 *     responses:
 *       200:
 *         description: Checklist question deleted successfully
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Checklist question not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', deleteChecklistQuestion);

export default router;
