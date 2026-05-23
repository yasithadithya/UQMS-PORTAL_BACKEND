import mongoose, { Schema, Document } from 'mongoose';

export interface IDocumentNumber extends Document {
  name: string;
  prefix: string;
  digits: number;
  lastNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

const documentNumberSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Document name is required'],
      unique: true,
      trim: true,
    },
    prefix: {
      type: String,
      required: [true, 'Prefix is required'],
      trim: true,
    },
    digits: {
      type: Number,
      required: [true, 'Digits is required'],
      min: [1, 'Digits must be at least 1'],
    },
    lastNumber: {
      type: Number,
      required: true,
      default: -1,
    },
  },
  {
    timestamps: true,
  }
);

const DocumentNumber = mongoose.model<IDocumentNumber>('DocumentNumber', documentNumberSchema);

export default DocumentNumber;
