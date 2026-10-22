import { Router } from 'express';
import authMiddleware from '../middleware/auth';
import { requireAny, requirePermission } from '../middleware/permission';
import {
  addSupportingDocument,
  allocateJob,
  authorizeJob,
  getAllocatableSurveyors,
  getAllocationQueue,
  getJobById,
  getJobCounts,
  getJobReports,
  getJobs,
  linkJobBooking,
  removeSupportingDocument,
  reviewJob,
  startJobReporting,
  submitJob,
  unmarkLastVisit,
  updateJobAllocation,
} from '../controllers/jobController';

/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: V2 survey jobs — surveyor allocation, my jobs, reporting workflow and authorization
 */
const router = Router();
router.use(authMiddleware);

const REPORTING = requireAny(['jobs.reporting'], ['update', 'create']);

/**
 * @swagger
 * /api/jobs/allocation-queue:
 *   get:
 *     summary: Requests with an accepted quotation that have no surveyor allocated yet
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/allocation-queue', requirePermission('surveyor-allocation', 'read'), getAllocationQueue);

/**
 * @swagger
 * /api/jobs/surveyors:
 *   get:
 *     summary: Users with the Surveyor or Assistant Surveyor role
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/surveyors', requireAny(['surveyor-allocation', 'jobs'], ['read']), getAllocatableSurveyors);

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List jobs (scope=mine|authorization|completed; filters sector, mainSurveyType, status, surveyTypeId, surveyorId, from, to, search)
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Allocate a surveyor to an accepted request (creates the job and issues the UQMS number)
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', requireAny(['jobs', 'authorization', 'view-report'], ['read']), getJobs);
router.post('/', requirePermission('surveyor-allocation', 'create'), allocateJob);
router.get('/counts', requirePermission('jobs', 'read'), getJobCounts);

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Job details with links to its booking, reports and certificate
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 *   patch:
 *     summary: Change the allocation before the reporting is submitted
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', requireAny(['jobs', 'authorization', 'view-report'], ['read']), getJobById);
router.patch('/:id', requirePermission('surveyor-allocation', 'update'), updateJobAllocation);

router.get('/:id/reports', requireAny(['jobs', 'authorization', 'view-report'], ['read']), getJobReports);
router.post('/:id/booking', REPORTING, linkJobBooking);
router.post('/:id/start-reporting', REPORTING, startJobReporting);
router.post('/:id/unmark-last-visit', REPORTING, unmarkLastVisit);
router.post('/:id/documents', REPORTING, addSupportingDocument);
router.delete('/:id/documents/:docId', REPORTING, removeSupportingDocument);

/**
 * @swagger
 * /api/jobs/{id}/submit:
 *   post:
 *     summary: Assistant surveyor submits the reporting for surveyor review
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 * /api/jobs/{id}/review:
 *   post:
 *     summary: Surveyor approves or rejects submitted reporting ({ decision, reason })
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 * /api/jobs/{id}/authorize:
 *   post:
 *     summary: Manager approves or rejects a signed job ({ decision, reason }); rejecting removes the certificate signature
 *     tags: [Jobs]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/submit', REPORTING, submitJob);
router.post('/:id/review', requirePermission('jobs.reporting', 'approve'), reviewJob);
router.post('/:id/authorize', requirePermission('authorization', 'approve'), authorizeJob);

export default router;
