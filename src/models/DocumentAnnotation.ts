import mongoose, { Schema, Document } from 'mongoose';

export const ANNOTATION_TYPES = ['cos-stamp', 'strike', 'cross', 'text'] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

/**
 * One mark drawn over a deliverable PDF. Position and size are fractions (0–1) of the page,
 * measured from its top-left corner, so they don't depend on how the page is rendered.
 */
export interface IAnnotationItem {
  type: AnnotationType;
  /** Zero-based page index. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text items: the text. COS stamps: the certifying person's name. */
  text?: string;
  /** Text items: font size in PDF points. */
  fontSize?: number;
  /** COS stamps: when the stamp was applied. */
  stampedAt?: Date;
}

/** Marks (certified stamp, strike-offs, crosses, text) added to a signable deliverable before it is signed. */
export interface IDocumentAnnotation extends Document {
  docType: string;
  docId: mongoose.Types.ObjectId;
  items: IAnnotationItem[];
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fraction = { type: Number, required: true, min: 0, max: 1 };

const annotationItemSchema = new Schema<IAnnotationItem>(
  {
    type: { type: String, enum: ANNOTATION_TYPES, required: true },
    page: { type: Number, required: true, min: 0 },
    x: fraction,
    y: fraction,
    width: fraction,
    height: fraction,
    text: { type: String, trim: true, maxlength: 500 },
    fontSize: { type: Number, min: 6, max: 36 },
    stampedAt: { type: Date },
  },
  { _id: false }
);

const documentAnnotationSchema = new Schema<IDocumentAnnotation>(
  {
    docType: { type: String, required: true, trim: true },
    docId: { type: Schema.Types.ObjectId, required: true },
    items: { type: [annotationItemSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

documentAnnotationSchema.index({ docType: 1, docId: 1 }, { unique: true });

const DocumentAnnotation = mongoose.model<IDocumentAnnotation>('DocumentAnnotation', documentAnnotationSchema);

export default DocumentAnnotation;
