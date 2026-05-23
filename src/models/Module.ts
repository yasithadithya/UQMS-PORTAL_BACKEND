import mongoose, { Schema, Document } from 'mongoose';

export interface IModule extends Document {
  name: string;
  description?: string;
  parentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const moduleSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Module name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Module',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Module = mongoose.model<IModule>('Module', moduleSchema);

export default Module;
