import mongoose, { Schema, Document } from 'mongoose';

export interface IDocumentTemplate extends Document {
  documentName: string;
  documentNumber: string;
  revision: string;
  effectiveDate: Date;
  approvedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentTemplateSchema: Schema = new Schema(
  {
    documentName: {
      type: String,
      required: [true, 'Document Name is required'],
      unique: true,
      trim: true,
    },
    documentNumber: {
      type: String,
      required: [true, 'Document Number is required'],
      trim: true,
    },
    revision: {
      type: String,
      required: [true, 'Revision is required'],
      trim: true,
    },
    effectiveDate: {
      type: Date,
      required: [true, 'Effective Date is required'],
    },
    approvedBy: {
      type: String,
      required: [true, 'Approved By is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const DocumentTemplate = mongoose.model<IDocumentTemplate>('DocumentTemplate', documentTemplateSchema);

export default DocumentTemplate;
