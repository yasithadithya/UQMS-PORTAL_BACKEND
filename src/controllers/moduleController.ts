import { Request, Response } from 'express';
import Module from '../models/Module';

export const createModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, parentId } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Module name is required.' });
      return;
    }

    const newModule = new Module({ name, description, parentId: parentId || null });
    await newModule.save();

    res.status(201).json({ success: true, message: 'Module created successfully.', data: newModule });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Module already exists.' });
      return;
    }
    res.status(500).json({ success: false, message: 'Error creating module.', error: error.message });
  }
};

export const getModules = async (_req: Request, res: Response): Promise<void> => {
  try {
    const modules = await Module.find().populate('parentId');
    res.status(200).json({ success: true, count: modules.length, data: modules });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching modules.', error: error.message });
  }
};

export const updateModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, parentId } = req.body;
    const mod = await Module.findByIdAndUpdate(
      req.params.id,
      { name, description, parentId: parentId || null },
      { new: true, runValidators: true }
    );

    if (!mod) {
      res.status(404).json({ success: false, message: 'Module not found.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Module updated successfully.', data: mod });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error updating module.', error: error.message });
  }
};

export const deleteModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const subModulesCount = await Module.countDocuments({ parentId: req.params.id });
    if (subModulesCount > 0) {
      res.status(400).json({ success: false, message: `Cannot delete module. ${subModulesCount} sub-modules depend on it.` });
      return;
    }

    const mod = await Module.findByIdAndDelete(req.params.id);
    if (!mod) {
      res.status(404).json({ success: false, message: 'Module not found.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Module deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting module.', error: error.message });
  }
};
