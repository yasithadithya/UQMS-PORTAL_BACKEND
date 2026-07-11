import express from 'express';
import employeeRoutes from './employeeRoutes';
import departmentRoutes from './departmentRoutes';
import jobTitleRoutes from './jobTitleRoutes';
import attendanceRoutes from './attendanceRoutes';
import leaveRoutes from './leaveRoutes';
import holidayRoutes from './holidayRoutes';
import payrollRoutes from './payrollRoutes';
import announcementRoutes from './announcementRoutes';
import dashboardRoutes from './dashboardRoutes';
import performanceRoutes from './performanceRoutes';
import trainingRoutes from './trainingRoutes';
import checklistRoutes from './checklistRoutes';
import documentRoutes from './documentRoutes';
import meRoutes from './meRoutes';
import authMiddleware from '../../middleware/auth';
import hrAdminMiddleware from '../middleware/hrAuth';

const router = express.Router();

// All HR routes require authentication
router.use(authMiddleware);

// Self-service routes: any authenticated user with a linked employee profile
router.use('/me', meRoutes);

// Everything below requires HR admin (admin role, or `update` on the HR module)
router.use(hrAdminMiddleware);

router.use('/employees', employeeRoutes);
router.use('/departments', departmentRoutes);
router.use('/jobtitles', jobTitleRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/holidays', holidayRoutes);
router.use('/payroll', payrollRoutes);
router.use('/announcements', announcementRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/performance', performanceRoutes);
router.use('/training', trainingRoutes);
router.use('/checklists', checklistRoutes);
router.use('/documents', documentRoutes);

export default router;
