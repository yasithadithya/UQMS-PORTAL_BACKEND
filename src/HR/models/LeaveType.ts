import mongoose, { Document, Schema } from 'mongoose';
import hrDbConnection from '../config/hrDb';

export interface ILeaveType extends Document {
  name: 'Annual' | 'Sick' | 'Casual' | 'Maternity' | 'Paternity' | 'Unpaid';
  defaultDaysPerYear: number;
  isCarryForwardAllowed: boolean;
  maxCarryForwardDays?: number;
  isPaidLeave: boolean;
}

const leaveTypeSchema = new Schema<ILeaveType>(
  {
    name: { 
      type: String, 
      enum: ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid'],
      required: true,
      unique: true
    },
    defaultDaysPerYear: { type: Number, required: true },
    isCarryForwardAllowed: { type: Boolean, default: false },
    maxCarryForwardDays: { type: Number },
    isPaidLeave: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const LeaveType = hrDbConnection.model<ILeaveType>('LeaveType', leaveTypeSchema);

export default LeaveType;
