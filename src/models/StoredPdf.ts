import { Schema } from 'mongoose';
import { ISignatureField, signatureFieldSchema } from './ESignature';

/**
 * Metadata for a generated PDF persisted in R2. Embedded on documents whose
 * PDF is linked from a QR code, so the scanned copy matches the issued one.
 */
export interface IStoredPdf {
  key: string;
  bucket: string;
  filename: string;
  size?: number;
  etag?: string;
  generatedAt: Date;
  /** Position of the electronic signature field in this PDF, when it has one. */
  signatureField?: ISignatureField;
}

export const storedPdfSchema = new Schema<IStoredPdf>(
  {
    key: { type: String, required: true, trim: true },
    bucket: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    size: { type: Number, min: 0 },
    etag: { type: String, trim: true },
    generatedAt: { type: Date, default: Date.now },
    signatureField: { type: signatureFieldSchema },
  },
  { _id: false }
);
