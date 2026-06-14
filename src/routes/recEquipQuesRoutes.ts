import { Router } from 'express';
import {
  getAllRecEquipQues,
  getRecEquipQuesById,
  createRecEquipQues,
  updateRecEquipQues,
  deleteRecEquipQues,
} from '../controllers/recEquipQuesController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Secure all RecEquipQues routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/rec-equip-ques:
 *   get:
 *     summary: Get all recommended equipment questions
 *     description: Retrieve all recommended equipment questions sorted by codeRefNo and creation date
 *     tags: [RecEquipQues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of recommended equipment questions
 *       401:
 *         description: Unauthorized
 */
router.get('/', getAllRecEquipQues);

/**
 * @swagger
 * /api/rec-equip-ques/{id}:
 *   get:
 *     summary: Get recommended equipment question by ID
 *     description: Retrieve a single recommended equipment question by ID
 *     tags: [RecEquipQues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Equipment question ID
 *     responses:
 *       200:
 *         description: Equipment question details
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Equipment question not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', getRecEquipQuesById);

/**
 * @swagger
 * /api/rec-equip-ques:
 *   post:
 *     summary: Create a new recommended equipment question
 *     description: Create a new recommended equipment question with a duplicate-allowed codeRefNo and description
 *     tags: [RecEquipQues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - codeRefNo
 *               - description
 *             properties:
 *               codeRefNo:
 *                 type: string
 *                 example: "11.4"
 *               description:
 *                 type: string
 *                 example: "Total number of Life rafts (Total number of persons accommodated)"
 *     responses:
 *       201:
 *         description: Equipment question created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/', createRecEquipQues);

/**
 * @swagger
 * /api/rec-equip-ques/{id}:
 *   put:
 *     summary: Update recommended equipment question
 *     description: Update an existing recommended equipment question's details
 *     tags: [RecEquipQues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Equipment question ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               codeRefNo:
 *                 type: string
 *                 example: "11.4"
 *               description:
 *                 type: string
 *                 example: "Updated question description"
 *     responses:
 *       200:
 *         description: Equipment question updated successfully
 *       400:
 *         description: Bad request or invalid ID format
 *       404:
 *         description: Equipment question not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', updateRecEquipQues);

/**
 * @swagger
 * /api/rec-equip-ques/{id}:
 *   delete:
 *     summary: Delete recommended equipment question
 *     description: Delete a recommended equipment question by ID
 *     tags: [RecEquipQues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Equipment question ID
 *     responses:
 *       200:
 *         description: Equipment question deleted successfully
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Equipment question not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', deleteRecEquipQues);

export default router;
