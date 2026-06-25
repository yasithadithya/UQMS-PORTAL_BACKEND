import express from 'express';
import employeeRoutes from './employeeRoutes';
import departmentRoutes from './departmentRoutes';
import jobTitleRoutes from './jobTitleRoutes';
import attendanceRoutes from './attendanceRoutes';
import leaveRoutes from './leaveRoutes';
import holidayRoutes from './holidayRoutes';
import payrollRoutes from './payrollRoutes';
import authMiddleware from '../../middleware/auth';

const router = express.Router();

// Apply authorization middleware to all HR routes
router.use(authMiddleware);

router.use('/employees', employeeRoutes);
router.use('/departments', departmentRoutes);
router.use('/jobtitles', jobTitleRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/holidays', holidayRoutes);
router.use('/payroll', payrollRoutes);

export default router;
