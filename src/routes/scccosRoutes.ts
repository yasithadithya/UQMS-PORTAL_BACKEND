import { Router } from 'express';
import {
  createSCCCOS,
  getAllSCCCOS,
  getSCCCOSById,
  updateSCCCOS,
  deleteSCCCOS,
  getSCCCOSPreviewPdf,
  getSCCCOSFinalPdf,
  getSCCCOSBySurveyReportId,
} from '../controllers/scccosController';
import authMiddleware from '../middleware/auth';

const router = Router();

// Protect all routes under SCCCOS Certificates
router.use(authMiddleware);

router.get('/report/:surveyReportId', getSCCCOSBySurveyReportId);

/**
 * @swagger
 * /api/scccos:
 *   post:
 *     summary: Create a new SCCCOS Certificate
 *     description: Create a new Safety Construction Certificate for Cargo Ships (SCCCOS) with auto-generated certificate number.
 *     tags: [SCCCOS Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vesselId
 *               - surveyReportId
 *               - surveyBookingId
 *             properties:
 *               vesselId:
 *                 type: string
 *                 description: The MongoDB ID of the Vessel
 *               surveyReportId:
 *                 type: string
 *                 description: The MongoDB ID of the Survey Report
 *               surveyBookingId:
 *                 type: string
 *                 description: The MongoDB ID of the Survey Booking
 *               dateOfIssue:
 *                 type: string
 *                 format: date-time
 *                 description: Optional date of issue. Defaults to current date.
 *               surveyFindings:
 *                 type: array
 *                 description: Optional array of findings with categories and statuses.
 *                 items:
 *                   type: object
 *                   required:
 *                     - category
 *                     - status
 *                   properties:
 *                     category:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [Satisfactory, Not Satisfactory, N/A]
 *     responses:
 *       201:
 *         description: SCCCOS Certificate created successfully
 *       400:
 *         description: Bad request or missing required fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Vessel, Report, or Booking not found
 */
router.post('/', createSCCCOS);

/**
 * @swagger
 * /api/scccos:
 *   get:
 *     summary: Get all SCCCOS Certificates
 *     description: Retrieve a list of all SCCCOS certificates with populated references.
 *     tags: [SCCCOS Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of certificates retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', getAllSCCCOS);

/**
 * @swagger
 * /api/scccos/{id}:
 *   get:
 *     summary: Get SCCCOS Certificate by ID
 *     description: Retrieve details of a single SCCCOS certificate by ID.
 *     tags: [SCCCOS Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID
 *     responses:
 *       200:
 *         description: Certificate retrieved successfully
 *       400:
 *         description: Invalid ID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Certificate not found
 */
router.get('/:id', getSCCCOSById);

/**
 * @swagger
 * /api/scccos/{id}:
 *   put:
 *     summary: Update SCCCOS Certificate
 *     description: Update fields of an existing SCCCOS certificate. The certificateNumber cannot be modified.
 *     tags: [SCCCOS Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vesselId:
 *                 type: string
 *               surveyReportId:
 *                 type: string
 *               surveyBookingId:
 *                 type: string
 *               dateOfIssue:
 *                 type: string
 *                 format: date-time
 *               surveyFindings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [Satisfactory, Not Satisfactory, N/A]
 *     responses:
 *       200:
 *         description: Certificate updated successfully
 *       400:
 *         description: Invalid input or ID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Certificate not found
 */
router.put('/:id', updateSCCCOS);

/**
 * @swagger
 * /api/scccos/{id}:
 *   delete:
 *     summary: Delete SCCCOS Certificate
 *     description: Delete an existing SCCCOS certificate by ID.
 *     tags: [SCCCOS Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID
 *     responses:
 *       200:
 *         description: Certificate deleted successfully
 *       400:
 *         description: Invalid ID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Certificate not found
 */
router.delete('/:id', deleteSCCCOS);

/**
 * @swagger
 * /api/scccos/preview:
 *   post:
 *     summary: Preview SCCCOS Certificate PDF
 *     description: Generates a temporary PDF preview of the SCCCOS certificate.
 *     tags: [SCCCOS Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/preview', getSCCCOSPreviewPdf);

/**
 * @swagger
 * /api/scccos/pdf/{id}:
 *   get:
 *     summary: View final SCCCOS Certificate PDF by ID
 *     description: Returns the generated PDF for a saved SCCCOS Certificate.
 *     tags: [SCCCOS Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/pdf/:id', getSCCCOSFinalPdf);

export default router;
