import { Router } from 'express';
import {
  createSurveyReport,
  getAllSurveyReports,
  getSurveyReportById,
  updateSurveyReport,
  deleteSurveyReport,
  getPrePopulatedReportData,
  generateSurveyReportPdf,
} from '../controllers/surveyReportController';
import authMiddleware from '../middleware/auth';

const router = Router();

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
