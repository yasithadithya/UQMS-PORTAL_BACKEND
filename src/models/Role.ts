import mongoose, { Schema, Document } from 'mongoose';
import { ACTIONS } from '../config/permissionRegistry';

import { auditPlugin } from '../plugins/auditPlugin';
export interface IRolePermission {
  module: mongoose.Types.ObjectId;
  actions: string[];
}

export interface IRole extends Document {
  roleName: string;
  permissions: IRolePermission[];
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema: Schema = new Schema(
  {
    roleName: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      trim: true,
    },
    permissions: [
      {
        module: {
          type: Schema.Types.ObjectId,
          ref: 'Module',
          required: true,
        },
        actions: [
          {
            type: String,
            enum: ACTIONS,
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

roleSchema.plugin(auditPlugin, { entityType: 'role' });

const Role = mongoose.model<IRole>('Role', roleSchema);

export default Role;
