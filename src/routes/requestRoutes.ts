import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import authMiddleware from '../middleware/auth';
import {
  createRequest,
  getAllRequests,
  getRequestById,
  updateRequest,
  deleteRequest,
  addRequestDocuments,
  updateRequestDocument,
  deleteRequestDocument,
  generateRequestSurveyPdf,
  getRequestSurveyPdf,
  getRequestSurveys,
  getRequestSurveyPreview,
  printAndSendRequestSurveyPdf,
} from '../controllers/requestController';

dotenv.config();

const router = Router();

const maxMb = Number(process.env.UPLOAD_MAX_MB || 10);
const maxBytes = Number.isFinite(maxMb) ? Math.floor(maxMb * 1024 * 1024) : 10 * 1024 * 1024;

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error('Invalid file type. Only PDF and images are allowed.'));
  },
});

router.use(authMiddleware);

/**
 * @swagger
 * /api/requests:
 *   post:
 *     summary: Create a new request
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imoNumber
 *               - companyName
 *               - contactPersonName
 *               - contactPersonNumber
 *               - sector
 *               - vesselType
 *               - areaOfOperation
 *               - surveyTypes
 *             properties:
 *               uqmsNumber:
 *                 type: string
 *               imoNumber:
 *                 type: string
 *               mmsiNumber:
 *                 type: string
 *               companyName:
 *                 type: string
 *               contactPersonName:
 *                 type: string
 *               contactPersonNumber:
 *                 type: string
 *               sector:
 *                 type: string
 *                 enum: [marine, industrial]
 *               vesselType:
 *                 type: string
 *               areaOfOperation:
 *                 type: string
 *               surveyTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *     responses:
 *       201:
 *         description: Request created successfully
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
 *                   $ref: '#/components/schemas/Request'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', createRequest);

/**
 * @swagger
 * /api/requests:
 *   get:
 *     summary: Get all requests
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of requests
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
 *                     $ref: '#/components/schemas/Request'
 *       401:
 *         description: Unauthorized
 */
router.get('/', getAllRequests);

/**
 * @swagger
 * /api/requests/{id}:
 *   get:
 *     summary: Get request by ID
 *     tags: [Requests]
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
 *         description: Request found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Request'
 *       404:
 *         description: Request not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', getRequestById);

/**
 * @swagger
 * /api/requests/{id}/surveys:
 *   get:
 *     summary: Get all surveys for a request by ID
 *     tags: [Requests]
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
 *         description: List of populated survey types for the request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Request not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id/surveys', getRequestSurveys);


/**
 * @swagger
 * /api/requests/{id}/survey-pdf:
 *   post:
 *     summary: Generate and store a survey request PDF
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Request survey PDF generated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 */
router.post('/:id/survey-pdf', generateRequestSurveyPdf);

/**
 * @swagger
 * /api/requests/{id}/survey-preview:
 *   get:
 *     summary: Dynamically generate and stream the survey request PDF preview
 *     tags: [Requests]
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
 *         description: PDF preview file returned successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Request not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id/survey-preview', getRequestSurveyPreview);

/**
 * @swagger
 * /api/requests/{id}/survey-print-send:
 *   post:
 *     summary: Generate PDF, store it, and email it to the client
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: PDF generated and sent successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 */
router.post('/:id/survey-print-send', printAndSendRequestSurveyPdf);

/**
 * @swagger
 * /api/requests/{id}/survey-pdf:
 *   get:
 *     summary: Get the stored survey request PDF
 *     tags: [Requests]
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
 *         description: PDF file returned successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: PDF not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id/survey-pdf', getRequestSurveyPdf);

/**
 * @swagger
 * /api/requests/{id}:
 *   put:
 *     summary: Update request
 *     tags: [Requests]
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
 *               uqmsNumber:
 *                 type: string
 *               imoNumber:
 *                 type: string
 *               mmsiNumber:
 *                 type: string
 *               companyName:
 *                 type: string
 *               contactPersonName:
 *                 type: string
 *               contactPersonNumber:
 *                 type: string
 *               sector:
 *                 type: string
 *                 enum: [marine, industrial]
 *               vesselType:
 *                 type: string
 *               areaOfOperation:
 *                 type: string
 *               surveyTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request updated successfully
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
 *                   $ref: '#/components/schemas/Request'
 *       404:
 *         description: Request not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', updateRequest);

/**
 * @swagger
 * /api/requests/{id}/documents:
 *   post:
 *     summary: Upload documents for a request
 *     tags: [Requests]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               documentNames:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Documents uploaded successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/documents', upload.array('files'), addRequestDocuments);

/**
 * @swagger
 * /api/requests/{id}/documents/{documentId}:
 *   put:
 *     summary: Update a request document
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/:id/documents/:documentId', upload.single('file'), updateRequestDocument);

/**
 * @swagger
 * /api/requests/{id}/documents/{documentId}:
 *   delete:
 *     summary: Delete a request document
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id/documents/:documentId', deleteRequestDocument);

/**
 * @swagger
 * /api/requests/{id}:
 *   delete:
 *     summary: Delete request
 *     tags: [Requests]
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
 *         description: Request deleted successfully
 *       404:
 *         description: Request not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', deleteRequest);

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        message: `File too large. Max ${maxMb} MB allowed.`,
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: err.message,
    });
    return;
  }

  if (err instanceof Error) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: 'Unexpected upload error.',
  });
});

export default router;
