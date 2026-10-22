import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth';
import { crudByMethod } from '../middleware/permission';
import PreviousDocument from '../models/PreviousDocument';
import { paginate } from '../utils/pagination';

/**
 * @swagger
 * tags:
 *   name: Previous Docs
 *   description: Documents from surveys done before the portal
 */
const router = Router();
router.use(authMiddleware, crudByMethod('previous-docs'));

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);

const cleanFiles = (docs: unknown) =>
  Array.isArray(docs)
    ? docs
        .filter((d: any) => d && typeof d.name === 'string' && typeof d.key === 'string')
        .map((d: any) => ({ name: d.name, key: d.key, url: d.url, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt ?? new Date() }))
    : undefined;

const fields = (body: any) => {
  const out: Record<string, unknown> = {};
  for (const f of ['uqmsNumber', 'vesselName', 'vesselCode', 'remarks']) {
    const v = text(body?.[f]);
    if (v !== undefined) out[f] = v;
  }
  const files = cleanFiles(body?.documents);
  if (files) out.documents = files;
  return out;
};

/**
 * @swagger
 * /api/previous-documents:
 *   get:
 *     summary: Search previous documents (uqmsNumber, vesselName, vesselCode, search)
 *     tags: [Previous Docs]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: File previous documents ({ uqmsNumber, vesselName, vesselCode, remarks, documents[] })
 *     tags: [Previous Docs]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    for (const f of ['uqmsNumber', 'vesselName', 'vesselCode']) {
      const v = text(req.query[f]);
      if (v) filter[f] = new RegExp(escapeRegex(v), 'i');
    }
    const search = text(req.query.search);
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ uqmsNumber: rx }, { vesselName: rx }, { vesselCode: rx }];
    }
    res.status(200).json(await paginate(PreviousDocument, filter, req, [], { updatedAt: -1 }));
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading previous documents.', error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.id;
    const doc = await PreviousDocument.create({ ...fields(req.body), createdBy: userId, updatedBy: userId });
    res.status(201).json({ success: true, message: 'Documents filed.', data: doc });
  } catch (error: any) {
    const status = error?.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ success: false, message: status === 400 ? error.message : 'Error filing documents.', error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid ID.' });
    return;
  }
  const doc = await PreviousDocument.findById(req.params.id);
  if (!doc) {
    res.status(404).json({ success: false, message: 'Not found.' });
    return;
  }
  res.status(200).json({ success: true, data: doc });
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid ID.' });
      return;
    }
    const doc = await PreviousDocument.findByIdAndUpdate(
      req.params.id,
      { $set: { ...fields(req.body), updatedBy: (req as AuthRequest).user?.id } },
      { new: true, runValidators: true }
    );
    if (!doc) {
      res.status(404).json({ success: false, message: 'Not found.' });
      return;
    }
    res.status(200).json({ success: true, message: 'Saved.', data: doc });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error saving.', error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid ID.' });
    return;
  }
  const doc = await PreviousDocument.findByIdAndDelete(req.params.id);
  if (!doc) {
    res.status(404).json({ success: false, message: 'Not found.' });
    return;
  }
  res.status(200).json({ success: true, message: 'Deleted.' });
});

export default router;
