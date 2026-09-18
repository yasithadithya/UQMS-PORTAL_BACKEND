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

const router = Router();

// Public route opened by the report QR code (unauthenticated)
router.get('/public-pdf/:id', getPublicSurveyReportPdf);

// Protect all survey report routes
router.use(authMiddleware);

// Standard CRUD endpoints
router.post('/', createSurveyReport);
router.get('/', getAllSurveyReports);
router.get('/pre-populate/:firstEntrySurveyReportId', getPrePopulatedReportData);
router.get('/:id', getSurveyReportById);
router.put('/:id', updateSurveyReport);
router.delete('/:id', deleteSurveyReport);

// PDF generation endpoint
router.get('/pdf/:id', generateSurveyReportPdf);

export default router;
