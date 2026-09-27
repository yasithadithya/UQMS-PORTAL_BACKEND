import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { rejectUnlessCan } from '../middleware/permission';
import Quotation, { OPEN_QUOTATION_STATUSES, QUOTATION_STATUSES, QuotationStatus } from '../models/Quotation';
import RequestModel from '../models/Request';
import { paginate } from '../utils/pagination';
import {
  QuotationError,
  allocateQuotationNumber,
  buildLineItems,
  cleanTextList,
  syncFirstEntryQuotation,
} from '../services/quotationService';
import { createQuotationPdfBuffer } from '../services/quotationPdfService';

const QUOTATIONS_KEY = 'finance.quotations';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const sendError = (res: Response, error: any, fallback: string): void => {
  if (error instanceof QuotationError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  if (error?.name === 'ValidationError') {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  res.status(500).json({ success: false, message: fallback, error: error?.message });
};

/** The editable fields shared by create and update; throws QuotationError on invalid input. */
const readQuotationBody = (body: any) => {
  const { lineItems, totalLkr, exchangeRate } = buildLineItems(body.lineItems, body.exchangeRate);

  const title = optionalText(body.title);
  if (!title) throw new QuotationError(400, 'Title is required.');

  const companyName = optionalText(body.client?.companyName);
  if (!companyName) throw new QuotationError(400, 'Client company name is required.');

  const quotationDate = body.quotationDate ? new Date(body.quotationDate) : new Date();
  if (isNaN(quotationDate.getTime())) throw new QuotationError(400, 'Quotation date is invalid.');

  return {
    quotationDate,
    title,
    vesselName: optionalText(body.vesselName),
    client: {
      companyName,
      address: optionalText(body.client?.address),
      contactPerson: optionalText(body.client?.contactPerson),
      email: optionalText(body.client?.email),
    },
    exchangeRate,
    lineItems,
    totalLkr,
    notes: cleanTextList(body.notes),
    paymentTerms: cleanTextList(body.paymentTerms),
    preparedByName: optionalText(body.preparedByName),
    preparedByDesignation: optionalText(body.preparedByDesignation),
  };
};

// List quotations (all revisions), newest first
export const getQuotations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query: Record<string, unknown> = {};
    const { search, status, request } = req.query;

    if (typeof status === 'string' && QUOTATION_STATUSES.includes(status as QuotationStatus)) query.status = status;
    if (typeof request === 'string' && mongoose.isValidObjectId(request)) query.request = request;
    if (typeof search === 'string' && search.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { quotationNumber: pattern },
        { requestNumber: pattern },
        { jobNumber: pattern },
        { vesselName: pattern },
        { 'client.companyName': pattern },
      ];
    }

    res.status(200).json(await paginate(Quotation, query, req, [], { createdAt: -1 }));
  } catch (error: any) {
    sendError(res, error, 'Error fetching quotations.');
  }
};

// Requests that have no quotation yet and haven't been rejected
export const getQuotableRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quotedRequestIds = await Quotation.distinct('request');
    const query: Record<string, unknown> = {
      _id: { $nin: quotedRequestIds },
      status: { $ne: 'reject' },
      approvalStatus: { $ne: 'rejected' },
    };

    const { search } = req.query;
    if (typeof search === 'string' && search.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ requestNumber: pattern }, { jobNumber: pattern }, { vesselName: pattern }, { companyName: pattern }];
    }

    const requests = await RequestModel.find(query)
      .select('requestNumber jobNumber rfsDocNo vesselName companyName contactPersonName companyEmail registerdAddress invoicingAddress status approvalStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (error: any) {
    sendError(res, error, 'Error fetching requests to quote.');
  }
};

// All quotations (revisions) for one request, oldest revision first
export const getQuotationsByRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    if (!mongoose.isValidObjectId(requestId)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const quotations = await Quotation.find({ request: requestId })
      .select('-lineItems -notes -paymentTerms')
      .sort({ revision: 1 })
      .lean();
    res.status(200).json({ success: true, count: quotations.length, data: quotations });
  } catch (error: any) {
    sendError(res, error, 'Error fetching quotations for the request.');
  }
};

export const getQuotationById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid quotation ID format.' });
      return;
    }

    const quotation = await Quotation.findById(id)
      .populate('request', 'requestNumber jobNumber rfsDocNo vesselName companyName status')
      .populate('revisedFrom', 'quotationNumber status')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .populate('statusChangedBy', 'username email');
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found.' });
      return;
    }

    res.status(200).json({ success: true, data: quotation });
  } catch (error: any) {
    sendError(res, error, 'Error fetching quotation.');
  }
};

/**
 * Creates a quotation. The first one for a request takes a new number; later ones are revisions
 * (same number, -R{n}) and supersede any draft or sent quotation still open for the request.
 */
export const createQuotation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { request: requestId, revisedFrom } = req.body;

    if (!mongoose.isValidObjectId(requestId)) {
      res.status(400).json({ success: false, message: 'Select the request to quote.' });
      return;
    }

    const request = await RequestModel.findById(requestId).select('requestNumber jobNumber vesselName').lean();
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (await Quotation.exists({ request: requestId, status: 'accepted' })) {
      res.status(409).json({ success: false, message: 'This request already has an accepted quotation.' });
      return;
    }

    if (revisedFrom !== undefined && revisedFrom !== null && revisedFrom !== '') {
      if (!mongoose.isValidObjectId(revisedFrom) || !(await Quotation.exists({ _id: revisedFrom, request: requestId }))) {
        res.status(400).json({ success: false, message: 'The quotation being revised does not belong to this request.' });
        return;
      }
    }

    const fields = readQuotationBody(req.body);
    const status: QuotationStatus = req.body.status === 'sent' ? 'sent' : 'draft';

    // Two users revising the same request at once can race for the same revision number; retry once.
    let quotation;
    for (let attempt = 0; ; attempt++) {
      const numbering = await allocateQuotationNumber(requestId);
      try {
        quotation = await Quotation.create({
          ...fields,
          ...numbering,
          request: requestId,
          requestNumber: request.requestNumber,
          jobNumber: request.jobNumber,
          vesselName: fields.vesselName ?? request.vesselName,
          status,
          statusChangedAt: new Date(),
          statusChangedBy: userId,
          revisedFrom: revisedFrom || undefined,
          createdBy: userId,
          updatedBy: userId,
        });
        break;
      } catch (error: any) {
        if (error?.code === 11000 && attempt === 0) continue;
        throw error;
      }
    }

    if (quotation.revision > 0) {
      await Quotation.updateMany(
        { request: requestId, _id: { $ne: quotation._id }, status: { $in: OPEN_QUOTATION_STATUSES } },
        { $set: { status: 'superseded', statusChangedAt: new Date(), statusChangedBy: userId } }
      );
    }

    res.status(201).json({ success: true, message: `Quotation ${quotation.quotationNumber} created successfully.`, data: quotation });
  } catch (error: any) {
    sendError(res, error, 'Error creating quotation.');
  }
};

// Update a draft or sent quotation. The request, number and revision never change.
export const updateQuotation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid quotation ID format.' });
      return;
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found.' });
      return;
    }
    if (!OPEN_QUOTATION_STATUSES.includes(quotation.status)) {
      res.status(409).json({ success: false, message: `A ${quotation.status} quotation can't be edited. Create a revision instead.` });
      return;
    }

    const fields = readQuotationBody(req.body);
    quotation.set({ ...fields, vesselName: fields.vesselName ?? quotation.vesselName, updatedBy: req.user?.id });
    await quotation.save();

    res.status(200).json({ success: true, message: 'Quotation updated successfully.', data: quotation });
  } catch (error: any) {
    sendError(res, error, 'Error updating quotation.');
  }
};

/**
 * Moves a quotation to sent, accepted or rejected. Accepting needs the approve action, supersedes
 * the request's other open quotations and marks its First Entry as quoted.
 */
export const updateQuotationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body as { status?: string; reason?: string };
    const userId = req.user?.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid quotation ID format.' });
      return;
    }
    if (status !== 'sent' && status !== 'accepted' && status !== 'rejected') {
      res.status(400).json({ success: false, message: 'Status must be sent, accepted or rejected.' });
      return;
    }
    if (await rejectUnlessCan(req, res, QUOTATIONS_KEY, status === 'sent' ? 'update' : 'approve')) return;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found.' });
      return;
    }
    if (!OPEN_QUOTATION_STATUSES.includes(quotation.status)) {
      res.status(409).json({ success: false, message: `This quotation is already ${quotation.status}.` });
      return;
    }

    const statusReason = optionalText(reason);
    if (status === 'rejected' && !statusReason) {
      res.status(400).json({ success: false, message: 'Give the reason the client rejected the quotation.' });
      return;
    }

    if (status === 'accepted') {
      const accepted = await Quotation.findOne({ request: quotation.request, status: 'accepted', _id: { $ne: quotation._id } }).select('quotationNumber');
      if (accepted) {
        res.status(409).json({ success: false, message: `Quotation ${accepted.quotationNumber} is already accepted for this request.` });
        return;
      }
    }

    const now = new Date();
    quotation.set({ status, statusReason: status === 'rejected' ? statusReason : undefined, statusChangedAt: now, statusChangedBy: userId, updatedBy: userId });
    await quotation.save();

    if (status === 'accepted') {
      await Quotation.updateMany(
        { request: quotation.request, _id: { $ne: quotation._id }, status: { $in: OPEN_QUOTATION_STATUSES } },
        { $set: { status: 'superseded', statusChangedAt: now, statusChangedBy: userId } }
      );
      await syncFirstEntryQuotation(quotation.request, quotation.quotationNumber);
    }

    res.status(200).json({ success: true, message: `Quotation marked ${status}.`, data: quotation });
  } catch (error: any) {
    sendError(res, error, 'Error updating quotation status.');
  }
};

// Delete a draft, only when it is the request's latest revision so numbering stays continuous
export const deleteQuotation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid quotation ID format.' });
      return;
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found.' });
      return;
    }
    if (quotation.status !== 'draft') {
      res.status(409).json({ success: false, message: 'Only draft quotations can be deleted.' });
      return;
    }
    if (await Quotation.exists({ request: quotation.request, revision: { $gt: quotation.revision } })) {
      res.status(409).json({ success: false, message: 'Only the latest revision can be deleted.' });
      return;
    }

    await quotation.deleteOne();
    res.status(200).json({ success: true, message: 'Quotation deleted successfully.' });
  } catch (error: any) {
    sendError(res, error, 'Error deleting quotation.');
  }
};

export const getQuotationPdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid quotation ID format.' });
      return;
    }

    const quotation = await Quotation.findById(id).lean();
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found.' });
      return;
    }

    const buffer = await createQuotationPdfBuffer(quotation);
    const filename = `${quotation.quotationNumber.replace(/[^\w-]+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (error: any) {
    sendError(res, error, 'Error generating quotation PDF.');
  }
};
