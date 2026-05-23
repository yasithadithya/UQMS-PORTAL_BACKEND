import mongoose, { Schema, Document } from 'mongoose';

export interface IVesselType extends Document {
  group: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const vesselTypeSchema: Schema = new Schema(
  {
    group: {
      type: String,
      required: [true, 'Vessel type group is required'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Vessel type name is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const VesselType = mongoose.model<IVesselType>('VesselType', vesselTypeSchema);

export default VesselType;
