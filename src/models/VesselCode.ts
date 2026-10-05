import mongoose, { Schema, Document } from 'mongoose';

import { auditPlugin } from '../plugins/auditPlugin';
export interface IVesselCode extends Document {
  code: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const vesselCodeSchema: Schema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Vessel code is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Vessel code description is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

vesselCodeSchema.plugin(auditPlugin, { entityType: 'vessel-code' });

const VesselCode = mongoose.model<IVesselCode>('VesselCode', vesselCodeSchema);

export default VesselCode;
