import express from 'express';
import {
  getJobTitles,
  createJobTitle,
} from '../controllers/jobTitleController';

const router = express.Router();

router.get('/', getJobTitles);
router.post('/', createJobTitle);

export default router;
