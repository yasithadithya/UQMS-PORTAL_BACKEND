import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth';
import { rejectUnlessCan } from '../middleware/permission';
import LibraryDocument, { DOCUMENT_LIBRARY_KEYS, DocumentLibraryKey } from '../models/LibraryDocument';
import { paginate } from '../utils/pagination';

/**
 * @swagger
 * tags:
 *   name: Document Library
 *   description: UQMS Rules & Guidelines and Flag Instructions (upload and view)
 */
const router = Router();
router.use(authMiddleware);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
const isLibrary = (v: unknown): v is DocumentLibraryKey => typeof v === 'string' && (DOCUMENT_LIBRARY_KEYS as readonly string[]).includes(v);

const cleanFiles = (docs: unknown) =>
  Array.isArray(docs)
    ? docs
        .filter((d: any) => d && typeof d.name === 'string' && typeof d.key === 'string')
        .map((d: any) => ({ name: d.name, key: d.key, url: d.url, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt ?? new Date() }))
    : undefined;

const fields = (body: any) => {
  const out: Record<string, unknown> = {};
  for (const f of ['title', 'referenceNumber', 'remarks']) {
    const v = text(body?.[f]);
    if (v !== undefined) out[f] = v;
  }
  if (body?.issueDate === null || body?.issueDate === '') out.issueDate = null;
  else if (body?.issueDate) {
    const d = new Date(body.issueDate);
    if (!Number.isNaN(d.getTime())) out.issueDate = d;
  }
  const files = cleanFiles(body?.documents);
  if (files) out.documents = files;
  return out;
};

const badId = (res: Response) => res.status(400).json({ success: false, message: 'Invalid ID.' });
const notFound = (res: Response) => res.status(404).json({ success: false, message: 'Not found.' });

/**
 * @swagger
 * /api/library-documents:
 *   get:
 *     summary: List documents of one library (?library=<module key>&search=)
 *     tags: [Document Library]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Upload a document ({ library, title, referenceNumber, issueDate, remarks, documents[] })
 *     tags: [Document Library]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const library = req.query.library;
    if (!isLibrary(library)) {
      res.status(400).json({ success: false, message: 'Choose a valid document library.' });
      return;
    }
    if (await rejectUnlessCan(req as AuthRequest, res, library, 'read')) return;
    const filter: Record<string, unknown> = { library };
    const search = text(req.query.search);
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ title: rx }, { referenceNumber: rx }, { remarks: rx }];
    }
    res.status(200).json(await paginate(LibraryDocument, filter, req, [], { issueDate: -1, createdAt: -1 }));
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading documents.', error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const library = req.body?.library;
    if (!isLibrary(library)) {
      res.status(400).json({ success: false, message: 'Choose a valid document library.' });
      return;
    }
    if (await rejectUnlessCan(req as AuthRequest, res, library, 'create')) return;
    const userId = (req as AuthRequest).user?.id;
    const doc = await LibraryDocument.create({ ...fields(req.body), library, createdBy: userId, updatedBy: userId });
    res.status(201).json({ success: true, message: 'Document saved.', data: doc });
  } catch (error: any) {
    const status = error?.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ success: false, message: status === 400 ? error.message : 'Error saving the document.', error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) return void badId(res);
  const doc = await LibraryDocument.findById(req.params.id);
  if (!doc) return void notFound(res);
  if (await rejectUnlessCan(req as AuthRequest, res, doc.library, 'read')) return;
  res.status(200).json({ success: true, data: doc });
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return void badId(res);
    const doc = await LibraryDocument.findById(req.params.id);
    if (!doc) return void notFound(res);
    if (await rejectUnlessCan(req as AuthRequest, res, doc.library, 'update')) return;
    doc.set({ ...fields(req.body), updatedBy: (req as AuthRequest).user?.id });
    await doc.save();
    res.status(200).json({ success: true, message: 'Saved.', data: doc });
  } catch (error: any) {
    const status = error?.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ success: false, message: status === 400 ? error.message : 'Error saving.', error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) return void badId(res);
  const doc = await LibraryDocument.findById(req.params.id);
  if (!doc) return void notFound(res);
  if (await rejectUnlessCan(req as AuthRequest, res, doc.library, 'delete')) return;
  await LibraryDocument.findByIdAndDelete(doc._id);
  res.status(200).json({ success: true, message: 'Deleted.' });
});

export default router;
