import { Router } from 'express';
import {
  createModule,
  getModules,
  updateModule,
  deleteModule,
} from '../controllers/moduleController';
import authMiddleware from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.use(authMiddleware);

// Every signed-in user needs the module tree to build their navigation.
router.get('/', getModules);

router.post('/', requirePermission('admin.modules', 'create'), createModule);
router.put('/:id', requirePermission('admin.modules', 'update'), updateModule);
router.delete('/:id', requirePermission('admin.modules', 'delete'), deleteModule);

export default router;
