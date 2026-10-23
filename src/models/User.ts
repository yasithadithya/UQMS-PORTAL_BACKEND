import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

import { auditPlugin } from '../plugins/auditPlugin';

export const DASHBOARD_WIDGET_SIZES = ['sm', 'md', 'lg'] as const;
export type DashboardWidgetSize = (typeof DASHBOARD_WIDGET_SIZES)[number];
export interface IDashboardWidget {
  /** Widget id from the frontend catalogue (e.g. "jobs.my-open"). */
  id: string;
  size: DashboardWidgetSize;
}

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  role: mongoose.Types.ObjectId;
  fullName: string;
  nameWithInitials?: string;
  phoneNumber: string;
  address?: string;
  dob?: Date | null;
  empNumber?: string;
  /** The user's own home dashboard: widget ids in display order. Unset = the default layout. */
  dashboardLayout?: IDashboardWidget[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema: Schema = new Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Role is required'],
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    nameWithInitials: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    dob: {
      type: Date,
      default: null,
    },
    empNumber: {
      type: String,
      trim: true,
    },
    // Not returned with the user record; read through /users/me/dashboard.
    dashboardLayout: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true },
            size: { type: String, enum: DASHBOARD_WIDGET_SIZES, default: 'md' },
          },
          { _id: false }
        ),
      ],
      default: undefined,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.plugin(auditPlugin, { entityType: 'user' });

const User = mongoose.model<IUser>('User', userSchema);

export default User;
