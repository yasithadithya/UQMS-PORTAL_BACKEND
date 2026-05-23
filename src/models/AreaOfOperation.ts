import mongoose, { Schema, Document } from 'mongoose';

export interface IAreaOfOperation extends Document {
  AreaCategory: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const areaOfOperationSchema: Schema = new Schema(
  {
    AreaCategory: {
      type: String,
      required: [true, 'Area of operation category is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Area of operation description is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const AreaOfOperation = mongoose.model<IAreaOfOperation>('AreaOfOperation', areaOfOperationSchema);

export default AreaOfOperation;
