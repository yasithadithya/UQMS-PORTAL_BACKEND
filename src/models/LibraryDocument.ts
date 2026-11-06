import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin } from '../plugins/auditPlugin';

/**
 * Reference documents uploaded and viewed in the portal: UQMS Rules & Guidelines and Flag
 * Instructions (Marine Shipping Notice, Marine News, Gazette, MSN). `library` is the permission
 * module key of the screen the document belongs to (see DOCUMENT_LIBRARY_KEYS).
 */
export const DOCUMENT_LIBRARY_KEYS = [
  'uqms-rules.rules',
  'uqms-rules.guidelines',
  'flag-instructions.marine-shipping-notice',
  'flag-instructions.marine-news',
  'flag-instructions.gazette',
  'flag-instructions.msn',
] as const;
export type DocumentLibraryKey = (typeof DOCUMENT_LIBRARY_KEYS)[number];

export interface ILibraryDocumentFile {
  _id?: mongoose.Types.ObjectId;
  name: string;
  key: string;
  url?: string;
  contentType?: string;
  size?: number;
  uploadedAt: Date;
}

export interface ILibraryDocument extends Document {
  library: DocumentLibraryKey;
  title: string;
  referenceNumber?: string;
  issueDate?: Date;
  remarks?: string;
  documents: ILibraryDocumentFile[];
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    contentType: { type: String, trim: true },
    size: { type: Number, min: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const libraryDocumentSchema = new Schema(
  {
    library: { type: String, required: true, enum: DOCUMENT_LIBRARY_KEYS, index: true },
    title: { type: String, required: [true, 'Title is required'], trim: true },
    referenceNumber: { type: String, trim: true },
    issueDate: { type: Date },
    remarks: { type: String, trim: true },
    documents: { type: [fileSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

libraryDocumentSchema.index({ library: 1, issueDate: -1 });
libraryDocumentSchema.plugin(auditPlugin, { entityType: 'library-document' });

const LibraryDocument = mongoose.model<ILibraryDocument>('LibraryDocument', libraryDocumentSchema);

export default LibraryDocument;
