import { Request, Response } from 'express';
import LeaveType from '../models/LeaveType';
import LeaveBalance from '../models/LeaveBalance';
import LeaveRequest from '../models/LeaveRequest';
import Employee from '../models/Employee';
import { calculateLeaveDays, approveLeave, rejectOrCancelLeave } from '../services/leaveService';
import { AuthRequest } from '../../middleware/auth';

export const getLeaveTypes = async (req: Request, res: Response): Promise<void> => {
  try {
    const types = await LeaveType.find();
    res.status(200).json({ success: true, data: types, message: 'Leave types fetched successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const getLeaveBalance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const year = new Date().getFullYear();
    const balances = await LeaveBalance.find({ employee: employeeId, year }).populate('leaveType');
    res.status(200).json({ success: true, data: balances, message: 'Balances fetched successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const submitLeaveRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employee, leaveType, startDate, endDate, reason } = req.body;
    
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    
    const totalDays = await calculateLeaveDays(sDate, eDate);
    if (totalDays <= 0) {
      res.status(400).json({ success: false, error: 'Invalid date range or no working days selected', details: [] });
      return;
    }

    const year = sDate.getFullYear();
    const balance = await LeaveBalance.findOne({ employee, leaveType, year });

    if (!balance || balance.remainingDays < totalDays) {
      res.status(400).json({ success: false, error: 'Insufficient leave balance', details: [] });
      return;
    }

    const request = new LeaveRequest({
      employee, leaveType, startDate: sDate, endDate: eDate, totalDays, reason, status: 'Pending'
    });

    await request.save();

    balance.pendingDays += totalDays;
    await balance.save();

    res.status(201).json({ success: true, data: request, message: 'Leave request submitted successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};

export const getLeaveRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employee = req.query.employeeId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const requests = await LeaveRequest.find(filter)
      .populate('leaveType')
      .populate('employee', 'firstName lastName employeeId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LeaveRequest.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: { requests, total, page, pages: Math.ceil(total / limit) },
      message: 'Leave requests fetched successfully'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const approveRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id; // from auth middleware
    const request = await approveLeave(req.params.id as string, userId as string);
    res.status(200).json({ success: true, data: request, message: 'Leave approved successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};

export const rejectRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const request = await rejectOrCancelLeave(req.params.id as string, 'Rejected', userId as string, req.body.rejectionReason as string);
    res.status(200).json({ success: true, data: request, message: 'Leave rejected successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};

export const cancelRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await rejectOrCancelLeave(req.params.id as string, 'Cancelled');
    res.status(200).json({ success: true, data: request, message: 'Leave cancelled successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};

export const initializeBalances = async (req: Request, res: Response): Promise<void> => {
  try {
    const { year } = req.body;
    const employees = await Employee.find({ isDeleted: false, employmentStatus: 'Active' });
    const leaveTypes = await LeaveType.find();

    for (const emp of employees) {
      for (const lt of leaveTypes) {
        await LeaveBalance.findOneAndUpdate(
          { employee: emp._id, leaveType: lt._id, year },
          {
            $setOnInsert: {
              employee: emp._id,
              leaveType: lt._id,
              year,
              totalDays: lt.defaultDaysPerYear,
              usedDays: 0,
              pendingDays: 0
            }
          },
          { upsert: true }
        );
      }
    }

    res.status(200).json({ success: true, message: 'Leave balances initialized successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};
