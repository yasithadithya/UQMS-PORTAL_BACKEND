import express from 'express';
import {
  getHolidays,
  addHoliday,
  removeHoliday,
} from '../controllers/holidayController';

const router = express.Router();

router.get('/', getHolidays);
router.post('/', addHoliday);
router.delete('/:id', removeHoliday);

export default router;
