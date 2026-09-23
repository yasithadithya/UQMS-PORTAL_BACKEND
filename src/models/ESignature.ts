import mongoose, { Schema } from 'mongoose';

/**
 * Electronic signature applied by the assigned surveyor. Once present, the
 * document is locked and its PDF carries the signature stamp.
 */
export interface IESignature {
  signedBy: mongoose.Types.ObjectId;
  signedByName: string;
  companyName: string;
  location: string;
  circularRef: string;
  signedAt: Date;
}

/**
 * Where the signature field sits in a generated PDF, in PDF points with a
 * top-left origin (pdfkit's coordinate system). `page` is zero-based.
 */
export interface ISignatureField {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export const eSignatureSchema = new Schema<IESignature>(
  {
    signedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    signedByName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    location: { type: String, default: '', trim: true },
    circularRef: { type: String, required: true, trim: true },
    signedAt: { type: Date, required: true },
  },
  { _id: false }
);

export const signatureFieldSchema = new Schema<ISignatureField>(
  {
    page: { type: Number, required: true, min: 0 },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    pageWidth: { type: Number, required: true },
    pageHeight: { type: Number, required: true },
  },
  { _id: false }
);
