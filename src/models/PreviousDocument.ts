import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin } from '../plugins/auditPlugin';

/** V2: documents from surveys done before the portal, filed by UQMS number and vessel. */
export interface IPreviousDocumentFile {
  _id?: mongoose.Types.ObjectId;
  name: string;
  key: string;
  url?: string;
  contentType?: string;
  size?: number;
  uploadedAt: Date;
}

export interface IPreviousDocument extends Document {
  uqmsNumber: string;
  vesselName: string;
  vesselCode?: string;
  remarks?: string;
  documents: IPreviousDocumentFile[];
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

const previousDocumentSchema = new Schema(
  {
    uqmsNumber: { type: String, required: [true, 'UQMS number is required'], trim: true, index: true },
    vesselName: { type: String, required: [true, 'Vessel name is required'], trim: true },
    vesselCode: { type: String, trim: true },
    remarks: { type: String, trim: true },
    documents: { type: [fileSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

previousDocumentSchema.plugin(auditPlugin, { entityType: 'previous-document' });

const PreviousDocument = mongoose.model<IPreviousDocument>('PreviousDocument', previousDocumentSchema);

export default PreviousDocument;
