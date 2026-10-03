import { Router, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth';
import { rejectUnlessCan } from '../middleware/permission';
import DocumentAnnotation from '../models/DocumentAnnotation';
import { getSignableDocument } from '../services/signableDocuments';
import { AnnotationError, COS_DOC_TYPES, cleanAnnotationItems, getAnnotationItems } from '../services/annotationService';
import { isSigned } from '../services/deliverableAccess';
import { recordAudit } from '../services/auditService';
import { userCan } from '../utils/permissions';

const router = Router();

router.use(authMiddleware);

/** Same modules the e-signature endpoints use for each document type. */
const moduleKeyFor = (docType: string): string => (docType === 'daily-report' ? 'marine.reports' : 'marine.certificates');

const loadDocument = async (req: AuthRequest, res: Response) => {
  const { docType, id } = req.params as { docType: string; id: string };
  const handler = getSignableDocument(docType);
  if (!handler) {
    res.status(404).json({ success: false, message: 'Unknown document type.' });
    return null;
  }
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    return null;
  }
  const doc = await handler.model.findById(id).select('eSignature');
  if (!doc) {
    res.status(404).json({ success: false, message: `${handler.label} not found.` });
    return null;
  }
  return { docType, id, doc, handler, moduleKey: moduleKeyFor(docType) };
};

/**
 * @swagger
 * /api/document-annotations/{docType}/{id}:
 *   get:
 *     summary: Annotations (certified stamp, strike-offs, crosses, text) on a signable deliverable
 *     tags: [E-Signature]
 *     security:
 *       - bearerAuth: []
 *   put:
 *     summary: Replace the annotations on a deliverable (only before it is signed)
 *     tags: [E-Signature]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 description: type (cos-stamp|strike|cross|text), page, x, y, width, height (fractions of the page), text, fontSize
 */
router.get('/:docType/:id', async (req: AuthRequest, res: Response) => {
  try {
    const loaded = await loadDocument(req, res);
    if (!loaded) return;
    if (await rejectUnlessCan(req, res, loaded.moduleKey, 'read')) return;

    const signed = isSigned(loaded.doc);
    res.status(200).json({
      success: true,
      data: {
        items: await getAnnotationItems(loaded.docType, loaded.id),
        signed,
        canEdit: !signed && (await userCan(req, loaded.moduleKey, 'update')),
        allowsCosStamp: COS_DOC_TYPES.has(loaded.docType),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading annotations.', error: error.message });
  }
});

router.put('/:docType/:id', async (req: AuthRequest, res: Response) => {
  try {
    const loaded = await loadDocument(req, res);
    if (!loaded) return;
    if (await rejectUnlessCan(req, res, loaded.moduleKey, 'update')) return;
    if (isSigned(loaded.doc)) {
      res.status(409).json({ success: false, message: `The ${loaded.handler.label} is signed and locked. Revoke the signature to change it.` });
      return;
    }

    const items = cleanAnnotationItems(req.body?.items, loaded.docType);
    const before = await getAnnotationItems(loaded.docType, loaded.id);
    await DocumentAnnotation.findOneAndUpdate(
      { docType: loaded.docType, docId: loaded.id },
      { $set: { items, updatedBy: req.user?.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    const count = (list: { type: string }[], type: string) => list.filter((item) => item.type === type).length;
    await recordAudit(req, {
      action: 'document.annotate',
      entityType: loaded.docType,
      entityId: loaded.id,
      entityRef: loaded.handler.label,
      changes: ['cos-stamp', 'strike', 'cross', 'text']
        .filter((type) => count(before, type) !== count(items, type))
        .map((type) => ({ field: type, from: count(before, type), to: count(items, type) })),
    });

    res.status(200).json({ success: true, message: 'Annotations saved.', data: { items } });
  } catch (error: any) {
    if (error instanceof AnnotationError) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Error saving annotations.', error: error.message });
  }
});

export default router;
