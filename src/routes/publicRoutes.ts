import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { documentTypeFromField } from '../models/Request';
import publicApiKey from '../middleware/publicApiKey';
import { createPublicSurveyRequest } from '../controllers/publicRequestController';

/**
 * Public intake routes.
 *
 * These are intentionally kept on their own router rather than added to
 * requestRoutes, which applies `router.use(authMiddleware)` to every route in
 * the file. Auth here is the shared API key in `x-api-key` instead of a JWT.
 */
const router = Router();

const publicIntakeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

const maxMb = Number(process.env.UPLOAD_MAX_MB || 10);
const maxBytes = Number.isFinite(maxMb) ? Math.floor(maxMb * 1024 * 1024) : 10 * 1024 * 1024;
const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * Supporting documents arrive as multipart files whose field name is the document type
 * (bill-of-sale, certificate-of-registry, ga-plan, non-convention-request, other).
 * JSON bodies (no files) are still accepted.
 */
const intakeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!documentTypeFromField(file.fieldname)) {
      cb(new Error(`Unknown document field "${file.fieldname}".`));
      return;
    }
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error('Invalid file type. Only PDF and images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

/**
 * @swagger
 * /api/public/survey-requests:
 *   post:
 *     summary: Create a survey request from the public website
 *     description: >
 *       Server-to-server intake endpoint used by the public website's form handler.
 *       Authenticated with a shared secret in the `x-api-key` header.
 *       Vessel type, area of operation and survey types are supplied as
 *       human-readable names and resolved against the seeded reference data.
 *       Marine sector only.
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             description: >
 *               Same fields as the JSON body (surveyTypes as repeated fields or a JSON array string),
 *               plus optional files named bill-of-sale, certificate-of-registry, ga-plan,
 *               non-convention-request or other.
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sector
 *               - vesselName
 *               - companyName
 *               - contactPersonName
 *               - contactPersonNumber
 *               - companyEmail
 *               - invoicingAddress
 *               - vesselType
 *               - areaOfOperation
 *               - surveyTypes
 *             properties:
 *               sector:              { type: string, example: marine }
 *               vesselName:          { type: string }
 *               companyName:         { type: string }
 *               contactPersonName:   { type: string }
 *               contactPersonNumber: { type: string }
 *               companyEmail:        { type: string }
 *               registerdAddress:    { type: string }
 *               invoicingAddress:    { type: string }
 *               vesselType:          { type: string, example: Cargo Vessels }
 *               areaOfOperation:     { type: string, example: Unrestricted Seagoing service }
 *               surveyTypes:
 *                 type: array
 *                 items: { type: string }
 *                 example: [Annual survey, Load Line Survey]
 *     responses:
 *       201:
 *         description: Request created
 *       400:
 *         description: Validation failed or a supplied name was not recognised
 *       401:
 *         description: Missing or invalid API key
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Public intake is not configured on the server
 */
router.post('/survey-requests', publicIntakeLimiter, publicApiKey, intakeUpload.any(), createPublicSurveyRequest);

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? `Each file must be ${maxMb} MB or smaller.` : err.message });
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }
  next(err);
});

export default router;
