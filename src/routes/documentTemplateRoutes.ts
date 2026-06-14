import { Router } from 'express';
import {
  getAllDocumentTemplates,
  getDocumentTemplateById,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from '../controllers/documentTemplateController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Secure all document template routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/document-templates:
 *   get:
 *     summary: Get all document templates
 *     description: Retrieve all document templates sorted alphabetically by document name
 *     tags: [DocumentTemplates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of document templates
 *       401:
 *         description: Unauthorized
 */
router.get('/', getAllDocumentTemplates);

/**
 * @swagger
 * /api/document-templates/{id}:
 *   get:
 *     summary: Get document template by ID
 *     description: Retrieve a single document template by ID
 *     tags: [DocumentTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document template ID
 *     responses:
 *       200:
 *         description: Document template details
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Document template not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', getDocumentTemplateById);

/**
 * @swagger
 * /api/document-templates:
 *   post:
 *     summary: Create a new document template
 *     description: Create a new document template
 *     tags: [DocumentTemplates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentName
 *               - documentNumber
 *               - revision
 *               - effectiveDate
 *               - approvedBy
 *             properties:
 *               documentName:
 *                 type: string
 *                 example: Request for Survey
 *               documentNumber:
 *                 type: string
 *                 example: F-SUR-01
 *               revision:
 *                 type: string
 *                 example: 00
 *               effectiveDate:
 *                 type: string
 *                 format: date-time
 *                 example: 2024-01-01T00:00:00.000Z
 *               approvedBy:
 *                 type: string
 *                 example: Manager
 *     responses:
 *       201:
 *         description: Document template created successfully
 *       400:
 *         description: Bad request
 *       409:
 *         description: Document template already exists
 *       401:
 *         description: Unauthorized
 */
router.post('/', createDocumentTemplate);

/**
 * @swagger
 * /api/document-templates/{id}:
 *   put:
 *     summary: Update document template
 *     description: Update an existing document template's details
 *     tags: [DocumentTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               documentName:
 *                 type: string
 *                 example: Request for Survey Updated
 *               documentNumber:
 *                 type: string
 *                 example: F-SUR-01
 *               revision:
 *                 type: string
 *                 example: 01
 *               effectiveDate:
 *                 type: string
 *                 format: date-time
 *                 example: 2024-01-02T00:00:00.000Z
 *               approvedBy:
 *                 type: string
 *                 example: Director
 *     responses:
 *       200:
 *         description: Document template updated successfully
 *       400:
 *         description: Bad request or invalid ID format
 *       404:
 *         description: Document template not found
 *       409:
 *         description: Document template already exists
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', updateDocumentTemplate);

/**
 * @swagger
 * /api/document-templates/{id}:
 *   delete:
 *     summary: Delete document template
 *     description: Delete a document template by ID
 *     tags: [DocumentTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document template ID
 *     responses:
 *       200:
 *         description: Document template deleted successfully
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Document template not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', deleteDocumentTemplate);

export default router;
