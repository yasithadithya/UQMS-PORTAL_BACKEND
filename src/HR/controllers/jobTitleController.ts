import { Request, Response } from 'express';
import JobTitle from '../models/JobTitle';

export const getJobTitles = async (req: Request, res: Response): Promise<void> => {
  try {
    const jobTitles = await JobTitle.find();
    res.status(200).json({ success: true, data: jobTitles, message: 'Job Titles fetched successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const createJobTitle = async (req: Request, res: Response): Promise<void> => {
  try {
    const jobTitle = new JobTitle(req.body);
    await jobTitle.save();
    res.status(201).json({ success: true, data: jobTitle, message: 'Job Title created successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};
