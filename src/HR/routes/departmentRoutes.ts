import express from 'express';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
} from '../controllers/departmentController';

const router = express.Router();

router.get('/', getDepartments);
router.post('/', createDepartment);
router.put('/:id', updateDepartment);

export default router;
