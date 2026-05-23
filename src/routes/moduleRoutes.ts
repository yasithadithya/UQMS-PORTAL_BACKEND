import { Router } from 'express';
import {
  createModule,
  getModules,
  updateModule,
  deleteModule,
} from '../controllers/moduleController';
import authMiddleware from '../middleware/auth';
import adminAuthMiddleware from '../middleware/adminAuth';

const router = Router();

router.use(authMiddleware);

router.get('/', getModules);

// Only admin can manage modules
router.use(adminAuthMiddleware);
router.post('/', createModule);
router.put('/:id', updateModule);
router.delete('/:id', deleteModule);

export default router;
