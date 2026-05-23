import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import authMiddleware from '../middleware/auth';
import { uploadFile } from '../controllers/uploadController';

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
 * /api/uploads:
 *   post:
 *     summary: Upload a file
 *     description: Upload a PDF or image file to R2 storage
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: prefix
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional folder prefix (default is uploads)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       400:
 *         description: Invalid file or file type
 *       401:
 *         description: Unauthorized
 */
router.post('/', upload.single('file'), uploadFile);

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
