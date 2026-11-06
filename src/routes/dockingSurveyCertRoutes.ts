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
import { requirePermission } from '../middleware/permission';
import { jobLock } from '../middleware/jobLock';

const router = express.Router();

// Public route opened by the certificate QR code (unauthenticated)
router.get('/public-pdf/:id', getPublicDockingSurveyPdf);

router.use(authMiddleware);

router.post('/', requirePermission('marine.certificates', 'create'), jobLock.surveyReportBody(), createDockingSurveyCert);
router.post('/preview', requirePermission('marine.certificates', 'read'), getDockingSurveyPreviewPdf);
router.get('/pdf/:id', requirePermission('marine.certificates', 'read'), getDockingSurveyFinalPdf);
router.get('/report/:surveyReportId', requirePermission('marine.certificates', 'read'), getDockingSurveyCertBySurveyReportId);

router.route('/:id')
  .get(requirePermission('marine.certificates', 'read'), getDockingSurveyCertById)
  .put(requirePermission('marine.certificates', 'update'), jobLock.dockingParam, updateDockingSurveyCert)
  .delete(requirePermission('marine.certificates', 'delete'), jobLock.dockingParam, deleteDockingSurveyCert);

export default router;
