import { Request, Response } from 'express';
import crypto from 'crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import mongoose from 'mongoose';
import path from 'path';
import RequestModel from '../models/Request';
import RequestDocumentModel from '../models/RequestDocument';
import VesselType from '../models/VesselType';
import AreaOfOperation from '../models/AreaOfOperation';
import SurveyType from '../models/SurveyType';
import { getR2Client } from '../config/r2';
import { getNextDocumentNumber } from '../services/documentNumberService';
import { deleteFromR2, uploadToR2 } from '../services/r2Storage';
import { createRequestSurveyPdfBuffer } from '../services/requestPdfService';
import { getIstDateParts } from '../utils/date';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const toTrimmedString = (value: string): string => value.trim();

const allowedStatuses = new Set(['active', 'print', 'reject']);

const normalizeStatus = (value: string): 'active' | 'print' | 'reject' | null => {
  const normalized = value.trim().toLowerCase();
  return allowedStatuses.has(normalized) ? (normalized as 'active' | 'print' | 'reject') : null;
};

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const mimeToExtension = (mimetype: string): string => {
  switch (mimetype) {
    case 'application/pdf':
      return '.pdf';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
};

const sanitizeSegment = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildDocumentKey = (
  requestNumber: string,
  documentName: string,
  originalname: string,
  mimetype: string
): string => {
  const extension = path.extname(originalname) || mimeToExtension(mimetype);
  const safeExtension = extension ? extension.toLowerCase() : '';
  const safeRequest = sanitizeSegment(requestNumber) || 'request';
  const safeName = sanitizeSegment(documentName) || 'document';
  const { year, month, day } = getIstDateParts();
  const fileId = crypto.randomUUID();

  return `requests/${safeRequest}/${safeName}/${year}/${month}/${day}/${fileId}${safeExtension}`;
};

const parseDocumentNames = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string') {
    return [value];
  }
  return undefined;
};

const getFallbackDocumentName = (filename: string): string => {
  const parsed = path.parse(filename).name;
  return parsed || 'document';
};

const buildSurveyPdfFilename = (requestNumber: string, vesselName: string): string => {
  const safeRequest = sanitizeSegment(requestNumber) || 'request';
  const safeVessel = sanitizeSegment(vesselName) || 'vessel';
  return `${safeRequest}-${safeVessel}-survey-request.pdf`;
};

const buildSurveyPdfKey = (requestNumber: string, vesselName: string): string => {
  const safeRequest = sanitizeSegment(requestNumber) || 'request';
  const safeVessel = sanitizeSegment(vesselName) || 'vessel';
  const { year, month, day } = getIstDateParts();
  const fileId = crypto.randomUUID();

  return `request-documents/${safeRequest}/${safeVessel}/${year}/${month}/${day}/${fileId}.pdf`;
};

const getPopulatedRequestForPdf = async (requestId: string) =>
  RequestModel.findById(requestId)
    .populate('vesselType')
    .populate('areaOfOperation')
    .populate('surveyTypes');

const getRequestSurveyPdfUrl = async (document: { url?: string; bucket: string; key: string }): Promise<string> => {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: document.bucket,
      Key: document.key,
    }),
    { expiresIn: 60 * 15 }
  );
};

export const createRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      uqmsNumber,
      imoNumber,
      vesselName,
      companyName,
      contactPersonName,
      contactPersonNumber,
      registerdAddress,
      invoicingAddress,
      companyEmail,
      sector,
      vesselType,
      areaOfOperation,
      surveyTypes,
      status,
    } = req.body;

    if (imoNumber !== undefined && typeof imoNumber !== 'string') {
      res.status(400).json({ success: false, message: 'IMO number must be a string.' });
      return;
    }
    if (!isNonEmptyString(vesselName)) {
      res.status(400).json({ success: false, message: 'Vessel name is required.' });
      return;
    }
    if (!isNonEmptyString(companyName)) {
      res.status(400).json({ success: false, message: 'Company name is required.' });
      return;
    }
    if (!isNonEmptyString(contactPersonName)) {
      res.status(400).json({ success: false, message: 'Contact person name is required.' });
      return;
    }
    if (!isNonEmptyString(contactPersonNumber)) {
      res.status(400).json({ success: false, message: 'Contact person number is required.' });
      return;
    }
    if (registerdAddress !== undefined && typeof registerdAddress !== 'string') {
      res.status(400).json({ success: false, message: 'Registered address must be a string.' });
      return;
    }
    if (!isNonEmptyString(invoicingAddress)) {
      res.status(400).json({ success: false, message: 'Invoicing address is required.' });
      return;
    }
    if (!isNonEmptyString(companyEmail)) {
      res.status(400).json({ success: false, message: 'Company email is required.' });
      return;
    }
    if (!isNonEmptyString(sector)) {
      res.status(400).json({ success: false, message: 'Sector is required.' });
      return;
    }

    const normalizedSector = sector.trim().toLowerCase();
    if (normalizedSector !== 'marine' && normalizedSector !== 'industrial') {
      res.status(400).json({ success: false, message: 'Sector must be either "marine" or "industrial".' });
      return;
    }

    if (!mongoose.isValidObjectId(vesselType)) {
      res.status(400).json({ success: false, message: 'Invalid vessel type ID.' });
      return;
    }
    if (!mongoose.isValidObjectId(areaOfOperation)) {
      res.status(400).json({ success: false, message: 'Invalid area of operation ID.' });
      return;
    }

    if (!Array.isArray(surveyTypes) || surveyTypes.length === 0) {
      res.status(400).json({ success: false, message: 'Survey types must be a non-empty array.' });
      return;
    }

    const surveyTypeIds = surveyTypes.map((id: unknown) => String(id));
    if (!surveyTypeIds.every((id) => mongoose.isValidObjectId(id))) {
      res.status(400).json({ success: false, message: 'One or more survey type IDs are invalid.' });
      return;
    }

    const uniqueSurveyTypeIds = Array.from(new Set(surveyTypeIds));

    const [vesselDoc, areaDoc, surveyCount] = await Promise.all([
      VesselType.findById(vesselType),
      AreaOfOperation.findById(areaOfOperation),
      SurveyType.countDocuments({ _id: { $in: uniqueSurveyTypeIds } }),
    ]);

    if (!vesselDoc) {
      res.status(400).json({ success: false, message: 'Vessel type not found.' });
      return;
    }
    if (!areaDoc) {
      res.status(400).json({ success: false, message: 'Area of operation not found.' });
      return;
    }
    if (surveyCount !== uniqueSurveyTypeIds.length) {
      res.status(400).json({ success: false, message: 'One or more survey types were not found.' });
      return;
    }

    let normalizedStatus: 'active' | 'print' | 'reject' | undefined;
    if (status !== undefined) {
      if (!isNonEmptyString(status)) {
        res.status(400).json({ success: false, message: 'Status must be a non-empty string.' });
        return;
      }
      const parsedStatus = normalizeStatus(status);
      if (!parsedStatus) {
        res.status(400).json({ success: false, message: 'Status must be active, print, or reject.' });
        return;
      }
      normalizedStatus = parsedStatus;
    }

    const requestNumber = await getNextDocumentNumber('request');

    const normalizedImoNumber = typeof imoNumber === 'string' ? toTrimmedString(imoNumber) : '';

    const newRequest = new RequestModel({
      requestNumber,
      uqmsNumber: typeof uqmsNumber === 'string' ? toTrimmedString(uqmsNumber) : undefined,
      imoNumber: normalizedImoNumber || undefined,
      vesselName: toTrimmedString(vesselName),
      companyName: toTrimmedString(companyName),
      contactPersonName: toTrimmedString(contactPersonName),
      contactPersonNumber: toTrimmedString(contactPersonNumber),
      registerdAddress: typeof registerdAddress === 'string' ? toTrimmedString(registerdAddress) : undefined,
      invoicingAddress: toTrimmedString(invoicingAddress),
      companyEmail: toTrimmedString(companyEmail),
      sector: normalizedSector,
      vesselType,
      areaOfOperation,
      surveyTypes: uniqueSurveyTypeIds,
      status: normalizedStatus,
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    });

    await newRequest.save();

    const populatedRequest = await RequestModel.findById(newRequest._id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('surveyTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Request created successfully.',
      data: populatedRequest,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Request number already exists.' });
      return;
    }
    res.status(500).json({ success: false, message: 'Error creating request.', error: error.message });
  }
};

export const getAllRequests = async (_req: Request, res: Response): Promise<void> => {
  try {
    const requests = await RequestModel.find()
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('surveyTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching requests.', error: error.message });
  }
};

export const getRequestById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await RequestModel.findById(req.params.id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('surveyTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    res.status(200).json({ success: true, data: request });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching request.', error: error.message });
  }
};

export const updateRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      uqmsNumber,
      imoNumber,
      vesselName,
      companyName,
      contactPersonName,
      contactPersonNumber,
      registerdAddress,
      invoicingAddress,
      companyEmail,
      sector,
      vesselType,
      areaOfOperation,
      surveyTypes,
      status,
    } = req.body;

    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    if (imoNumber !== undefined && typeof imoNumber !== 'string') {
      res.status(400).json({ success: false, message: 'IMO number must be a string.' });
      return;
    }
    if (vesselName !== undefined && !isNonEmptyString(vesselName)) {
      res.status(400).json({ success: false, message: 'Vessel name must be a non-empty string.' });
      return;
    }
    if (uqmsNumber !== undefined && typeof uqmsNumber !== 'string') {
      res.status(400).json({ success: false, message: 'UQMS number must be a string.' });
      return;
    }
    if (companyName !== undefined && !isNonEmptyString(companyName)) {
      res.status(400).json({ success: false, message: 'Company name must be a non-empty string.' });
      return;
    }
    if (contactPersonName !== undefined && !isNonEmptyString(contactPersonName)) {
      res.status(400).json({ success: false, message: 'Contact person name must be a non-empty string.' });
      return;
    }
    if (contactPersonNumber !== undefined && !isNonEmptyString(contactPersonNumber)) {
      res.status(400).json({ success: false, message: 'Contact person number must be a non-empty string.' });
      return;
    }
    if (registerdAddress !== undefined && typeof registerdAddress !== 'string') {
      res.status(400).json({ success: false, message: 'Registered address must be a string.' });
      return;
    }
    if (invoicingAddress !== undefined && !isNonEmptyString(invoicingAddress)) {
      res.status(400).json({ success: false, message: 'Invoicing address must be a non-empty string.' });
      return;
    }
    if (companyEmail !== undefined && !isNonEmptyString(companyEmail)) {
      res.status(400).json({ success: false, message: 'Company email must be a non-empty string.' });
      return;
    }

    let normalizedSector: string | undefined;
    if (sector !== undefined) {
      if (!isNonEmptyString(sector)) {
        res.status(400).json({ success: false, message: 'Sector must be a non-empty string.' });
        return;
      }
      normalizedSector = sector.trim().toLowerCase();
      if (normalizedSector !== 'marine' && normalizedSector !== 'industrial') {
        res.status(400).json({ success: false, message: 'Sector must be either "marine" or "industrial".' });
        return;
      }
    }

    let normalizedStatus: 'active' | 'print' | 'reject' | undefined;
    if (status !== undefined) {
      if (!isNonEmptyString(status)) {
        res.status(400).json({ success: false, message: 'Status must be a non-empty string.' });
        return;
      }
      const parsedStatus = normalizeStatus(status);
      if (!parsedStatus) {
        res.status(400).json({ success: false, message: 'Status must be active, print, or reject.' });
        return;
      }
      normalizedStatus = parsedStatus;
    }

    if (vesselType !== undefined && !mongoose.isValidObjectId(vesselType)) {
      res.status(400).json({ success: false, message: 'Invalid vessel type ID.' });
      return;
    }
    if (areaOfOperation !== undefined && !mongoose.isValidObjectId(areaOfOperation)) {
      res.status(400).json({ success: false, message: 'Invalid area of operation ID.' });
      return;
    }

    let uniqueSurveyTypeIds: string[] | undefined;
    if (surveyTypes !== undefined) {
      if (!Array.isArray(surveyTypes) || surveyTypes.length === 0) {
        res.status(400).json({ success: false, message: 'Survey types must be a non-empty array.' });
        return;
      }
      const surveyTypeIds = surveyTypes.map((id: unknown) => String(id));
      if (!surveyTypeIds.every((id) => mongoose.isValidObjectId(id))) {
        res.status(400).json({ success: false, message: 'One or more survey type IDs are invalid.' });
        return;
      }
      uniqueSurveyTypeIds = Array.from(new Set(surveyTypeIds));
    }

    const request = await RequestModel.findById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.status !== 'active') {
      res.status(400).json({ success: false, message: 'Only active requests can be edited.' });
      return;
    }

    if (vesselType !== undefined) {
      const vesselDoc = await VesselType.findById(vesselType);
      if (!vesselDoc) {
        res.status(400).json({ success: false, message: 'Vessel type not found.' });
        return;
      }
      request.vesselType = vesselType;
    }

    if (areaOfOperation !== undefined) {
      const areaDoc = await AreaOfOperation.findById(areaOfOperation);
      if (!areaDoc) {
        res.status(400).json({ success: false, message: 'Area of operation not found.' });
        return;
      }
      request.areaOfOperation = areaOfOperation;
    }

    if (uniqueSurveyTypeIds) {
      const surveyCount = await SurveyType.countDocuments({ _id: { $in: uniqueSurveyTypeIds } });
      if (surveyCount !== uniqueSurveyTypeIds.length) {
        res.status(400).json({ success: false, message: 'One or more survey types were not found.' });
        return;
      }
      request.set('surveyTypes', uniqueSurveyTypeIds);
    }

    if (uqmsNumber !== undefined) {
      request.uqmsNumber = uqmsNumber ? toTrimmedString(uqmsNumber) : '';
    }
    if (imoNumber !== undefined) {
      request.imoNumber = imoNumber ? toTrimmedString(imoNumber) : '';
    }
    if (vesselName !== undefined) {
      request.vesselName = toTrimmedString(vesselName);
    }
    if (companyName !== undefined) {
      request.companyName = toTrimmedString(companyName);
    }
    if (contactPersonName !== undefined) {
      request.contactPersonName = toTrimmedString(contactPersonName);
    }
    if (contactPersonNumber !== undefined) {
      request.contactPersonNumber = toTrimmedString(contactPersonNumber);
    }
    if (registerdAddress !== undefined) {
      request.registerdAddress = registerdAddress ? toTrimmedString(registerdAddress) : '';
    }
    if (invoicingAddress !== undefined) {
      request.invoicingAddress = toTrimmedString(invoicingAddress);
    }
    if (companyEmail !== undefined) {
      request.companyEmail = toTrimmedString(companyEmail);
    }
    if (normalizedSector !== undefined) {
      request.sector = normalizedSector as 'marine' | 'industrial';
    }
    if (normalizedStatus !== undefined) {
      request.status = normalizedStatus;
    }
    
    if ((req as any).user?.id) {
      request.updatedBy = (req as any).user.id;
    }

    await request.save();

    const populatedRequest = await RequestModel.findById(request._id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('surveyTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'Request updated successfully.',
      data: populatedRequest,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error updating request.', error: error.message });
  }
};

export const addRequestDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await RequestModel.findById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.status !== 'active') {
      res.status(400).json({ success: false, message: 'Only active requests can be edited.' });
      return;
    }

    const files = (req as Request & { files?: Express.Multer.File[] }).files;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, message: 'At least one document is required.' });
      return;
    }

    const documentNames = parseDocumentNames(req.body.documentNames ?? req.body.documentName);

    const documentsToAdd = [] as Array<{
      name: string;
      key: string;
      url?: string;
      contentType?: string;
      size?: number;
      uploadedAt: Date;
    }>;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      if (!allowedMimeTypes.has(file.mimetype)) {
        res.status(400).json({ success: false, message: 'Invalid file type. Only PDF and images are allowed.' });
        return;
      }

      const providedName = documentNames?.[index];
      const name = isNonEmptyString(providedName)
        ? toTrimmedString(providedName)
        : getFallbackDocumentName(file.originalname);

      const key = buildDocumentKey(request.requestNumber, name, file.originalname, file.mimetype);

      const uploadResult = await uploadToR2({
        key,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });

      documentsToAdd.push({
        name,
        key: uploadResult.key,
        url: uploadResult.url,
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      });
    }

    if ((req as any).user?.id) {
      request.updatedBy = (req as any).user.id;
    }
    request.set('documents', [...request.documents, ...documentsToAdd]);
    await request.save();

    const populatedRequest = await RequestModel.findById(request._id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('surveyTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Documents uploaded successfully.',
      data: populatedRequest,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error uploading documents.', error: error.message });
  }
};

export const updateRequestDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await RequestModel.findById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.status !== 'active') {
      res.status(400).json({ success: false, message: 'Only active requests can be edited.' });
      return;
    }

    const documentId = req.params.documentId;
    const document = request.documents.find((item) => item._id?.toString() === documentId);
    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found.' });
      return;
    }

    const nameInput = typeof req.body.name === 'string' ? req.body.name : req.body.documentName;
    const file = (req as Request & { file?: Express.Multer.File }).file;

    if (!file && nameInput === undefined) {
      res.status(400).json({ success: false, message: 'Nothing to update.' });
      return;
    }

    if (nameInput !== undefined && !isNonEmptyString(nameInput)) {
      res.status(400).json({ success: false, message: 'Document name must be a non-empty string.' });
      return;
    }

    if (file && !allowedMimeTypes.has(file.mimetype)) {
      res.status(400).json({ success: false, message: 'Invalid file type. Only PDF and images are allowed.' });
      return;
    }

    const updatedName = isNonEmptyString(nameInput) ? toTrimmedString(nameInput) : document.name;

    if (file) {
      const key = buildDocumentKey(request.requestNumber, updatedName, file.originalname, file.mimetype);
      const uploadResult = await uploadToR2({
        key,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });

      const previousKey = document.key;
      document.key = uploadResult.key;
      document.url = uploadResult.url;
      document.contentType = file.mimetype;
      document.size = file.size;
      document.uploadedAt = new Date();

      if (previousKey && previousKey !== uploadResult.key) {
        try {
          await deleteFromR2(previousKey);
        } catch (error) {
        }
      }
    }

    if (isNonEmptyString(nameInput)) {
      document.name = updatedName;
    }

    if ((req as any).user?.id) {
      request.updatedBy = (req as any).user.id;
    }

    await request.save();

    const populatedRequest = await RequestModel.findById(request._id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('surveyTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'Document updated successfully.',
      data: populatedRequest,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error updating document.', error: error.message });
  }
};

export const deleteRequestDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await RequestModel.findById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.status !== 'active') {
      res.status(400).json({ success: false, message: 'Only active requests can be edited.' });
      return;
    }

    const documentId = req.params.documentId;
    const document = request.documents.find((item) => item._id?.toString() === documentId);
    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found.' });
      return;
    }

    if (document.key) {
      try {
        await deleteFromR2(document.key);
      } catch (error) {
      }
    }

    if ((req as any).user?.id) {
      request.updatedBy = (req as any).user.id;
    }

    request.documents = request.documents.filter((item) => item._id?.toString() !== documentId);
    await request.save();

    const populatedRequest = await RequestModel.findById(request._id)
      .populate('vesselType')
      .populate('areaOfOperation')
      .populate('surveyTypes')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully.',
      data: populatedRequest,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting document.', error: error.message });
  }
};

export const deleteRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await RequestModel.findByIdAndDelete(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Request deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting request.', error: error.message });
  }
};

export const generateRequestSurveyPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await getPopulatedRequestForPdf(req.params.id as string);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    const pdfBuffer = await createRequestSurveyPdfBuffer(request.toObject());
    const filename = buildSurveyPdfFilename(request.requestNumber, request.vesselName);
    const key = buildSurveyPdfKey(request.requestNumber, request.vesselName);
    const uploadResult = await uploadToR2({
      key,
      body: pdfBuffer,
      contentType: 'application/pdf',
      contentLength: pdfBuffer.length,
    });

    if (request.status === 'active') {
      request.status = 'print';
      if ((req as any).user?.id) {
        request.updatedBy = (req as any).user.id;
      }
      await request.save();
    }

    const existingDocument = await RequestDocumentModel.findOne({ requestId: request._id });
    if (existingDocument?.key && existingDocument.key !== uploadResult.key) {
      try {
        await deleteFromR2(existingDocument.key);
      } catch (error) {
      }
    }

    const storedDocument = await RequestDocumentModel.findOneAndUpdate(
      { requestId: request._id },
      {
        requestId: request._id,
        requestNumber: request.requestNumber,
        vesselName: request.vesselName,
        key: uploadResult.key,
        url: uploadResult.url,
        bucket: uploadResult.bucket,
        mimeType: 'application/pdf',
        filename,
        size: pdfBuffer.length,
        etag: uploadResult.etag,
        generatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const url = await getRequestSurveyPdfUrl({
      bucket: uploadResult.bucket,
      key: uploadResult.key,
    });

    res.status(201).json({
      success: true,
      message: 'Request survey PDF generated successfully.',
      data: {
        _id: storedDocument?._id,
        requestId: storedDocument?.requestId,
        requestNumber: storedDocument?.requestNumber,
        vesselName: storedDocument?.vesselName,
        key: storedDocument?.key,
        bucket: storedDocument?.bucket,
        filename: storedDocument?.filename,
        mimeType: storedDocument?.mimeType,
        size: storedDocument?.size,
        etag: storedDocument?.etag,
        generatedAt: storedDocument?.generatedAt,
        url,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generating request survey PDF.', error: error.message });
  }
};

export const getRequestSurveyPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await RequestModel.findById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    const storedDocument = await RequestDocumentModel.findOne({ requestId: request._id });
    if (!storedDocument) {
      res.status(404).json({ success: false, message: 'Request survey PDF not found. Generate it first.' });
      return;
    }

    const url = await getRequestSurveyPdfUrl(storedDocument.toObject());
    res.status(200).json({
      success: true,
      data: {
        url,
        filename: storedDocument.filename,
        requestNumber: storedDocument.requestNumber,
        vesselName: storedDocument.vesselName,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching request survey PDF.', error: error.message });
  }
};

export const getRequestSurveys = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid request ID format.' });
      return;
    }

    const request = await RequestModel.findById(req.params.id).populate('surveyTypes');
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: request.surveyTypes,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching request surveys.', error: error.message });
  }
};

