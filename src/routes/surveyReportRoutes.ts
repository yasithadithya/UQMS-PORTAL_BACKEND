import { Router } from 'express';
import {
  createSurveyReport,
  getAllSurveyReports,
  getSurveyReportById,
  updateSurveyReport,
  deleteSurveyReport,
  getPrePopulatedReportData,
  generateSurveyReportPdf,
  getPublicSurveyReportPdf,
} from '../controllers/surveyReportController';
import authMiddleware from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// Public route opened by the report QR code (unauthenticated)
router.get('/public-pdf/:id', getPublicSurveyReportPdf);

// Protect all survey report routes
router.use(authMiddleware);

// Standard CRUD endpoints
router.post('/', requirePermission('marine.certificates', 'create'), createSurveyReport);
router.get('/', requirePermission('marine.certificates', 'read'), getAllSurveyReports);
router.get('/pre-populate/:firstEntrySurveyReportId', requirePermission('marine.certificates', 'read'), getPrePopulatedReportData);
router.get('/:id', requirePermission('marine.certificates', 'read'), getSurveyReportById);
router.put('/:id', requirePermission('marine.certificates', 'update'), updateSurveyReport);
router.delete('/:id', requirePermission('marine.certificates', 'delete'), deleteSurveyReport);

// PDF generation endpoint
router.get('/pdf/:id', requirePermission('marine.certificates', 'read'), generateSurveyReportPdf);

export default router;
