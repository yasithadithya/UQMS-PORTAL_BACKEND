import { Router } from 'express';
import { createFeeItem, deleteFeeItem, getFeeItems, updateFeeItem } from '../controllers/feeItemController';
import {
  approveQuotation,
  createQuotation,
  deleteQuotation,
  getQuotableRequests,
  getQuotationById,
  getQuotationPdf,
  getQuotations,
  getQuotationsByRequest,
  revokeQuotationApproval,
  sendQuotationToClient,
  updateQuotation,
  updateQuotationStatus,
} from '../controllers/quotationController';
import authMiddleware from '../middleware/auth';
import { requireAny, requirePermission } from '../middleware/permission';

const router = Router();

const QUOTATIONS = 'finance.quotations';
const FEE_STRUCTURE = 'finance.fee-structure';

router.use(authMiddleware);

// ───────────── Fee structure ─────────────

/**
 * @swagger
 * /api/finance/fee-items:
 *   get:
 *     summary: Get the survey fee structure
 *     description: All fee items sorted by category and order. Readable with Fee Structure or Quotations access.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ['true']
 *         description: Only active items
 *     responses:
 *       200:
 *         description: List of fee items
 *   post:
 *     summary: Create a fee item
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category, currency, rate]
 *             properties:
 *               name: { type: string, example: Docking survey }
 *               category: { type: string, enum: [survey, transport, additional] }
 *               currency: { type: string, enum: [USD, LKR] }
 *               standardRate: { type: number, example: 700 }
 *               rate: { type: number, example: 490 }
 *               unit: { type: string, enum: [visit, trip, hour, lump sum] }
 *               notes: { type: string }
 *               isActive: { type: boolean }
 *               order: { type: number }
 *     responses:
 *       201:
 *         description: Fee item created
 *       409:
 *         description: Name already exists
 */
router.get('/fee-items', requireAny([FEE_STRUCTURE, QUOTATIONS], ['read']), getFeeItems);
router.post('/fee-items', requirePermission(FEE_STRUCTURE, 'create'), createFeeItem);

/**
 * @swagger
 * /api/finance/fee-items/{id}:
 *   put:
 *     summary: Update a fee item
 *     description: Existing quotations keep the values they were created with.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Fee item updated
 *   delete:
 *     summary: Delete a fee item
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Fee item deleted
 */
router.put('/fee-items/:id', requirePermission(FEE_STRUCTURE, 'update'), updateFeeItem);
router.delete('/fee-items/:id', requirePermission(FEE_STRUCTURE, 'delete'), deleteFeeItem);

// ───────────── Quotations ─────────────

/**
 * @swagger
 * /api/finance/quotations:
 *   get:
 *     summary: List quotations
 *     description: All quotations including revisions, newest first. Paginated.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Quotation, request or job number, vessel or company
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, sent, accepted, rejected, superseded] }
 *       - in: query
 *         name: request
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated quotations
 *   post:
 *     summary: Create a quotation
 *     description: >
 *       The first quotation for a request takes the next number from the "quotation" document counter.
 *       Later ones are revisions (same number with -R1, -R2, …) and supersede the request's open quotations.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [request, title, client, exchangeRate, lineItems]
 *             properties:
 *               request: { type: string }
 *               revisedFrom: { type: string }
 *               status: { type: string, enum: [draft, sent] }
 *               quotationDate: { type: string, format: date }
 *               title: { type: string, example: QUOTATION FOR – CHRISTOS }
 *               vesselName: { type: string }
 *               client:
 *                 type: object
 *                 properties:
 *                   companyName: { type: string }
 *                   address: { type: string }
 *                   contactPerson: { type: string }
 *                   email: { type: string }
 *               exchangeRate: { type: number, example: 328.13 }
 *               lineItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     feeItem: { type: string }
 *                     description: { type: string }
 *                     currency: { type: string, enum: [USD, LKR] }
 *                     rate: { type: number }
 *                     quantity: { type: number }
 *               notes: { type: array, items: { type: string } }
 *               paymentTerms: { type: array, items: { type: string } }
 *               preparedByName: { type: string }
 *               preparedByDesignation: { type: string }
 *     responses:
 *       201:
 *         description: Quotation created
 *       409:
 *         description: The request already has an accepted quotation
 */
router.get('/quotations', requirePermission(QUOTATIONS, 'read'), getQuotations);
router.post('/quotations', requirePermission(QUOTATIONS, 'create'), createQuotation);

/**
 * @swagger
 * /api/finance/quotations/quotable-requests:
 *   get:
 *     summary: Requests that have not been quoted yet
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Requests without a quotation
 */
router.get('/quotations/quotable-requests', requirePermission(QUOTATIONS, 'read'), getQuotableRequests);

/**
 * @swagger
 * /api/finance/quotations/by-request/{requestId}:
 *   get:
 *     summary: All quotations (revisions) for a request
 *     description: Also readable with First Entry access, so the First Entry form can pick up the accepted quotation.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Quotations ordered by revision
 */
router.get('/quotations/by-request/:requestId', requireAny([QUOTATIONS, 'marine.entries'], ['read']), getQuotationsByRequest);

/**
 * @swagger
 * /api/finance/quotations/{id}:
 *   get:
 *     summary: Get a quotation
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Quotation details
 *   put:
 *     summary: Update a draft or sent quotation
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Quotation updated
 *       409:
 *         description: Quotation is no longer editable
 *   delete:
 *     summary: Delete a draft quotation (latest revision only)
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Quotation deleted
 */
router.get('/quotations/:id', requirePermission(QUOTATIONS, 'read'), getQuotationById);
router.put('/quotations/:id', requirePermission(QUOTATIONS, 'update'), updateQuotation);
router.delete('/quotations/:id', requirePermission(QUOTATIONS, 'delete'), deleteQuotation);

/**
 * @swagger
 * /api/finance/quotations/{id}/status:
 *   patch:
 *     summary: Mark a quotation sent, accepted or rejected
 *     description: >
 *       Sent needs update access; accepted and rejected need approve access. Accepting supersedes the
 *       request's other open quotations and marks its First Entry as quoted.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [sent, accepted, rejected] }
 *               reason: { type: string, description: Required when rejected }
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/quotations/:id/status', requireAny([QUOTATIONS], ['update', 'approve']), updateQuotationStatus);

/**
 * @swagger
 * /api/finance/quotations/{id}/pdf:
 *   get:
 *     summary: Quotation PDF
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF document
 *         content:
 *           application/pdf: {}
 */
router.get('/quotations/:id/pdf', requirePermission(QUOTATIONS, 'read'), getQuotationPdf);

/**
 * @swagger
 * /api/finance/quotations/{id}/approve:
 *   post:
 *     summary: Approve the quotation (cleared again on any edit)
 *     description: An approved quotation prints as system generated, with no signature required.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Revoke the quotation's approval
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 */
router.post('/quotations/:id/approve', requirePermission(QUOTATIONS, 'approve'), approveQuotation);
router.delete('/quotations/:id/approve', requirePermission(QUOTATIONS, 'approve'), revokeQuotationApproval);

/**
 * @swagger
 * /api/finance/quotations/{id}/send:
 *   post:
 *     summary: Email the RFS and quotation PDFs to the client email on the survey request
 *     description: A draft quotation is marked sent.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message: { type: string, description: Optional note added to the email }
 */
router.post('/quotations/:id/send', requirePermission(QUOTATIONS, 'update'), sendQuotationToClient);

export default router;
