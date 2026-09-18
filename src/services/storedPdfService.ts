import { Request } from 'express';
import { Model } from 'mongoose';
import { IStoredPdf } from '../models/StoredPdf';
import { deleteFromR2, downloadFromR2, getPresignedGetUrl, uploadToR2 } from './r2Storage';

export type RenderedPdf = {
  buffer: Buffer;
  pdf: IStoredPdf;
};

/** Renders a document's PDF, stores it in R2 and returns it; null when the document no longer exists. */
export type RenderAndStorePdf = () => Promise<RenderedPdf | null>;

/** Text encoded in QR codes on previews, which have no stored document to link to yet. */
export const PREVIEW_QR_TEXT = 'PREVIEW - NOT A VALID DOCUMENT';

/**
 * Absolute URL for a public (unauthenticated) API path, used as QR code content.
 * PUBLIC_API_BASE_URL pins it to the public hostname; otherwise the incoming request's host is used.
 */
export const buildPublicApiUrl = (req: Request, path: string): string => {
  const configuredBase = process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '');
  const base = configuredBase || `${req.protocol}://${req.get('host')}`;
  return `${base}${path}`;
};

/**
 * Uploads a generated PDF to R2 and records its metadata in the document's `pdf` field.
 * Uses a stable key per document, so regenerating replaces the previous version.
 */
export const storePdf = async (
  model: Model<any>,
  id: string,
  key: string,
  filename: string,
  buffer: Buffer
): Promise<IStoredPdf> => {
  const uploadResult = await uploadToR2({
    key,
    body: buffer,
    contentType: 'application/pdf',
    contentLength: buffer.length,
  });

  const pdf: IStoredPdf = {
    key: uploadResult.key,
    bucket: uploadResult.bucket,
    filename,
    size: buffer.length,
    etag: uploadResult.etag,
    generatedAt: new Date(),
  };

  await model.updateOne({ _id: id }, { $set: { pdf } }, { timestamps: false });

  return pdf;
};

/**
 * Stores a document's PDF after a save without failing the save itself.
 * A missing PDF is regenerated on its next download or QR scan.
 */
export const storePdfAfterSave = async (label: string, renderAndStore: RenderAndStorePdf): Promise<void> => {
  try {
    await renderAndStore();
  } catch (error) {
    console.error(`Failed to store ${label} PDF in R2:`, error);
  }
};

/** Returns the stored PDF bytes, regenerating and storing the PDF if it is missing from R2. */
export const readStoredPdf = async (
  stored: IStoredPdf | undefined,
  renderAndStore: RenderAndStorePdf
): Promise<Buffer | null> => {
  if (stored?.key) {
    try {
      return await downloadFromR2(stored.key, stored.bucket);
    } catch (error) {
      console.error(`Stored PDF ${stored.key} could not be read from R2; regenerating:`, error);
    }
  }

  const rendered = await renderAndStore();
  return rendered ? rendered.buffer : null;
};

/** Returns a short-lived presigned URL for the stored PDF, generating and storing the PDF first if needed. */
export const getStoredPdfUrl = async (
  stored: IStoredPdf | undefined,
  renderAndStore: RenderAndStorePdf
): Promise<string | null> => {
  const pdf = stored?.key ? stored : (await renderAndStore())?.pdf;
  return pdf ? getPresignedGetUrl(pdf.key, pdf.bucket) : null;
};

/** Removes a deleted document's PDF from R2; failures are logged, not thrown. */
export const deleteStoredPdf = async (stored: IStoredPdf | undefined): Promise<void> => {
  if (!stored?.key) return;
  try {
    await deleteFromR2(stored.key);
  } catch (error) {
    console.error(`Failed to delete stored PDF ${stored.key} from R2:`, error);
  }
};
