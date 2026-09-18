import express from 'express';
import {
  createDockingSurveyCert,
  getDockingSurveyCertById,
  updateDockingSurveyCert,
  deleteDockingSurveyCert,
  getDockingSurveyPreviewPdf,
  getDockingSurveyFinalPdf,
  getDockingSurveyCertBySurveyReportId,
  getPublicDockingSurveyPdf
} from '../controllers/dockingSurveyCertController';
import authMiddleware from '../middleware/auth';

const router = express.Router();

// Public route opened by the certificate QR code (unauthenticated)
router.get('/public-pdf/:id', getPublicDockingSurveyPdf);

router.use(authMiddleware);

router.post('/', createDockingSurveyCert);
router.post('/preview', getDockingSurveyPreviewPdf);
router.get('/pdf/:id', getDockingSurveyFinalPdf);
router.get('/report/:surveyReportId', getDockingSurveyCertBySurveyReportId);

router.route('/:id')
  .get(getDockingSurveyCertById)
  .put(updateDockingSurveyCert)
  .delete(deleteDockingSurveyCert);

export default router;
