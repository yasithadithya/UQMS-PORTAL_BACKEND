import { Request, Response } from 'express';
import Module from '../models/Module';
import Role from '../models/Role';
import { ACTIONS, CRUD_ACTIONS } from '../config/permissionRegistry';
import { invalidateModuleCache } from '../utils/permissions';

/** Custom modules may only offer known actions; defaults to CRUD. */
const sanitizeActions = (actions: unknown): string[] => {
  if (!Array.isArray(actions)) return [...CRUD_ACTIONS];
  const valid = [...new Set(actions.filter((a): a is string => typeof a === 'string' && (ACTIONS as readonly string[]).includes(a)))];
  return valid.includes('read') ? valid : ['read', ...valid];
};

/**
 * Walk the parentId chain from a given moduleId upward to detect circular references.
 * Returns the set of all ancestor IDs. If moduleId appears in the chain, it's circular.
 */
const getAncestorIds = async (parentId: string | null, maxDepth = 20): Promise<Set<string>> => {
  const ancestors = new Set<string>();
  let currentId = parentId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    if (ancestors.has(currentId)) break; // already visited — circular in existing data
    ancestors.add(currentId);
    const parent = await Module.findById(currentId).select('parentId').lean();
    currentId = parent?.parentId?.toString() || null;
    depth++;
  }

  return ancestors;
};

/**
 * Get all descendant IDs of a given module (recursive).
 */
const getDescendantIds = async (moduleId: string): Promise<Set<string>> => {
  const descendants = new Set<string>();
  const queue = [moduleId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await Module.find({ parentId: currentId }).select('_id').lean();
    for (const child of children) {
      const childId = child._id.toString();
      if (!descendants.has(childId)) {
        descendants.add(childId);
        queue.push(childId);
      }
    }
  }

  return descendants;
};

export const createModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, parentId, order, actions } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Module name is required.' });
      return;
    }

    // Validate that parentId exists if provided
    if (parentId) {
      const parentExists = await Module.findById(parentId);
      if (!parentExists) {
        res.status(400).json({ success: false, message: 'Parent module not found.' });
        return;
      }
    }

    // `key`, `isSystem` and `navigable` are reserved for registry-defined system modules.
    const newModule = new Module({ name, description, parentId: parentId || null, order: order || 0, actions: sanitizeActions(actions) });
    await newModule.save();
    invalidateModuleCache();

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
    const modules = await Module.find().sort({ order: 1, createdAt: 1 }).populate('parentId');
    res.status(200).json({ success: true, count: modules.length, data: modules });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching modules.', error: error.message });
  }
};

export const updateModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, parentId, order, actions } = req.body;
    const moduleId: string = req.params.id as string;

    const existing = await Module.findById(moduleId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Module not found.' });
      return;
    }

    // System modules keep their name, parent and actions: code, routes and permissions depend on them.
    if (existing.isSystem) {
      const sameParent = String(existing.parentId ?? '') === String(parentId ?? '');
      if ((name !== undefined && name !== existing.name) || (parentId !== undefined && !sameParent) || actions !== undefined) {
        res.status(400).json({ success: false, message: 'System modules cannot be renamed, moved or have their actions changed. Only the description and order can be edited.' });
        return;
      }
      if (description !== undefined) existing.description = description;
      if (order !== undefined) existing.order = order;
      await existing.save();
      invalidateModuleCache();
      res.status(200).json({ success: true, message: 'Module updated successfully.', data: existing });
      return;
    }

    if (!name) {
      res.status(400).json({ success: false, message: 'Module name is required.' });
      return;
    }

    // Prevent setting self as parent
    if (parentId && parentId === moduleId) {
      res.status(400).json({ success: false, message: 'A module cannot be its own parent.' });
      return;
    }

    // Prevent circular reference: parentId must not be a descendant of this module
    if (parentId) {
      const descendants = await getDescendantIds(moduleId);
      if (descendants.has(parentId)) {
        res.status(400).json({ success: false, message: 'Circular reference detected. The selected parent is a descendant of this module.' });
        return;
      }

      // Also verify parent exists
      const parentExists = await Module.findById(parentId);
      if (!parentExists) {
        res.status(400).json({ success: false, message: 'Parent module not found.' });
        return;
      }
    }
    
    const updateData: any = { name, description, parentId: parentId || null };
    if (order !== undefined) {
      updateData.order = order;
    }
    if (actions !== undefined) {
      updateData.actions = sanitizeActions(actions);
    }

    const mod = await Module.findByIdAndUpdate(
      moduleId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!mod) {
      res.status(404).json({ success: false, message: 'Module not found.' });
      return;
    }
    invalidateModuleCache();

    // Drop granted actions the module no longer offers.
    if (actions !== undefined) {
      await Role.updateMany(
        { 'permissions.module': mod._id },
        { $pull: { 'permissions.$[p].actions': { $nin: mod.actions } } },
        { arrayFilters: [{ 'p.module': mod._id }], audit: { action: 'module.permissions.cascade', metadata: { module: mod.key || mod.name } } }
      );
    }

    res.status(200).json({ success: true, message: 'Module updated successfully.', data: mod });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'A module with this name already exists.' });
      return;
    }
    res.status(500).json({ success: false, message: 'Error updating module.', error: error.message });
  }
};

export const deleteModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const target = await Module.findById(req.params.id).select('isSystem name');
    if (!target) {
      res.status(404).json({ success: false, message: 'Module not found.' });
      return;
    }
    if (target.isSystem) {
      res.status(400).json({ success: false, message: `"${target.name}" is a system module and cannot be deleted.` });
      return;
    }

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

    // Remove the deleted module from every role's permissions so no dangling references remain.
    await Role.updateMany(
      {},
      { $pull: { permissions: { module: mod._id } } },
      { audit: { action: 'module.permissions.cascade', metadata: { module: mod.key || mod.name, deleted: true } } }
    );
    invalidateModuleCache();

    res.status(200).json({ success: true, message: 'Module deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting module.', error: error.message });
  }
};
