import { Request, Response } from 'express';
import Employee from '../models/Employee';
import EmploymentHistory from '../models/EmploymentHistory';

export const getEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };
    if (req.query.department) filter.department = req.query.department;
    if (req.query.status) filter.employmentStatus = req.query.status;
    if (req.query.type) filter.employmentType = req.query.type;
    if (req.query.search) {
      filter.$or = [
        { firstName: new RegExp(req.query.search as string, 'i') },
        { lastName: new RegExp(req.query.search as string, 'i') },
        { employeeId: new RegExp(req.query.search as string, 'i') },
      ];
    }

    const sortField = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    const employees = await Employee.find(filter)
      .populate('department', 'name')
      .populate('jobTitle', 'title')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit);

    const total = await Employee.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        employees,
        total,
        page,
        pages: Math.ceil(total / limit)
      },
      message: 'Employees fetched successfully'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const getEmployeeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate('department')
      .populate('jobTitle')
      .populate('reportsTo', 'firstName lastName employeeId');

    if (!employee || employee.isDeleted) {
      res.status(404).json({ success: false, error: 'Employee not found', details: [] });
      return;
    }
    res.status(200).json({ success: true, data: employee, message: 'Employee fetched successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    // Auto-generate employeeId
    const count = await Employee.countDocuments();
    const newIdStr = `EMP${String(count + 1).padStart(3, '0')}`;
    
    const employeeData = { ...req.body, employeeId: newIdStr };
    const employee = new Employee(employeeData);
    await employee.save();

    // Log employment history initially
    if (employee.jobTitle || employee.department) {
      await EmploymentHistory.create({
        employee: employee._id,
        jobTitle: employee.jobTitle,
        department: employee.department,
        startDate: employee.joinedDate || new Date(),
        reason: 'New Joining'
      });
    }

    res.status(201).json({ success: true, data: employee, message: 'Employee created successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};

export const updateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!employee || employee.isDeleted) {
      res.status(404).json({ success: false, error: 'Employee not found', details: [] });
      return;
    }
    res.status(200).json({ success: true, data: employee, message: 'Employee updated successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};

export const deleteEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!employee) {
      res.status(404).json({ success: false, error: 'Employee not found', details: [] });
      return;
    }
    res.status(200).json({ success: true, data: employee, message: 'Employee deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const getEmployeeHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const history = await EmploymentHistory.find({ employee: req.params.id })
      .populate('jobTitle')
      .populate('department')
      .sort({ startDate: -1 });
    res.status(200).json({ success: true, data: history, message: 'Employee history fetched successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};

export const transferEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department, jobTitle, reason, effectiveDate } = req.body;
    const employee = await Employee.findById(req.params.id);
    if (!employee || employee.isDeleted) {
      res.status(404).json({ success: false, error: 'Employee not found', details: [] });
      return;
    }

    // Close current history
    await EmploymentHistory.findOneAndUpdate(
      { employee: employee._id, endDate: { $exists: false } },
      { endDate: effectiveDate ? new Date(effectiveDate) : new Date() },
      { sort: { startDate: -1 } }
    );

    // Add new history
    await EmploymentHistory.create({
      employee: employee._id,
      jobTitle: jobTitle || employee.jobTitle,
      department: department || employee.department,
      startDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      reason: reason || 'Transfer'
    });

    // Update employee record
    if (department) employee.department = department;
    if (jobTitle) employee.jobTitle = jobTitle;
    await employee.save();

    res.status(200).json({ success: true, data: employee, message: 'Employee transferred successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, details: [] });
  }
};

export const uploadPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: 'No file uploaded', details: [] });
      return;
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { profilePhotoUrl: file.path },
      { new: true }
    );

    if (!employee) {
      res.status(404).json({ success: false, error: 'Employee not found', details: [] });
      return;
    }

    res.status(200).json({ success: true, data: employee, message: 'Photo uploaded successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, details: [] });
  }
};
