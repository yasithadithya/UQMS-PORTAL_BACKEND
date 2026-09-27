import mongoose, { Schema, Document } from 'mongoose';
import { ACTIONS, CRUD_ACTIONS } from '../config/permissionRegistry';

export interface IModule extends Document {
  name: string;
  description?: string;
  parentId?: mongoose.Types.ObjectId;
  order?: number;
  /** Stable identifier for system modules; code references modules by key, never by name. */
  key?: string;
  /** System modules are defined in config/permissionRegistry and can't be deleted, renamed or moved. */
  isSystem: boolean;
  /** false = permission-only module (shown in Role Management, not in navigation). */
  navigable: boolean;
  /** Actions that can be granted on this module. */
  actions: string[];
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
    order: {
      type: Number,
      default: 0,
    },
    key: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    navigable: {
      type: Boolean,
      default: true,
    },
    actions: {
      type: [{ type: String, enum: ACTIONS }],
      default: () => [...CRUD_ACTIONS],
    },
  },
  {
    timestamps: true,
  }
);

const Module = mongoose.model<IModule>('Module', moduleSchema);

export default Module;
