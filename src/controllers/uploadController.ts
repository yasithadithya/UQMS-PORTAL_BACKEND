import { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { uploadToR2 } from '../services/r2Storage';
import { getIstDateParts } from '../utils/date';

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
    case 'application/msword':
      return '.doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    default:
      return '';
  }
};

const sanitizePrefix = (value: string): string => {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
};

const buildObjectKey = (originalname: string, mimetype: string, prefix: string): string => {
  const extension = path.extname(originalname) || mimeToExtension(mimetype);
  const safeExtension = extension ? extension.toLowerCase() : '';
  const { year, month, day } = getIstDateParts();
  const fileId = crypto.randomUUID();
  const base = `${year}/${month}/${day}/${fileId}${safeExtension}`;

  return prefix ? `${prefix}/${base}` : base;
};

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'File is required.',
      });
      return;
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, Word documents, and images are allowed.',
      });
      return;
    }

    const rawPrefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
    const normalizedPrefix = sanitizePrefix(rawPrefix || 'uploads');
    const prefix = normalizedPrefix || 'uploads';
    const key = buildObjectKey(file.originalname, file.mimetype, prefix);

    const uploadResult = await uploadToR2({
      key,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully.',
      data: {
        key: uploadResult.key,
        bucket: uploadResult.bucket,
        url: uploadResult.url,
        etag: uploadResult.etag,
        contentType: file.mimetype,
        size: file.size,
      },
    });
  } catch (error: any) {
    const message = typeof error?.message === 'string' && error.message.startsWith('Missing R2_')
      ? 'Storage is not configured.'
      : 'Error uploading file.';

    res.status(500).json({
      success: false,
      message,
    });
  }
};
