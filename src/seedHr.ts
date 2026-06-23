import mongoose from 'mongoose';
import dotenv from 'dotenv';
import hrDbConnection from './HR/config/hrDb';
import LeaveType from './HR/models/LeaveType';
import Department from './HR/models/Department';
import Employee from './HR/models/Employee';
import AttendanceLog from './HR/models/AttendanceLog';
import LeaveBalance from './HR/models/LeaveBalance';

import connectDB from './config/db';
import User from './models/User';
import Role from './models/Role';
import bcrypt from 'bcrypt';

dotenv.config();

const seedHr = async () => {
  try {
    console.log('Connecting to databases...');
    await connectDB();
    
    console.log('Clearing existing HR data...');
    await LeaveType.deleteMany({});
    await Department.deleteMany({});
    await Employee.deleteMany({});
    await AttendanceLog.deleteMany({});
    await LeaveBalance.deleteMany({});

    console.log('Seeding Leave Types...');
    const leaveTypesData = [
      { name: 'Annual', defaultDaysPerYear: 14, isPaidLeave: true },
      { name: 'Sick', defaultDaysPerYear: 7, isPaidLeave: true },
      { name: 'Casual', defaultDaysPerYear: 7, isPaidLeave: true },
      { name: 'Maternity', defaultDaysPerYear: 84, isPaidLeave: true },
      { name: 'Paternity', defaultDaysPerYear: 3, isPaidLeave: true },
    ];
    const leaveTypes = await LeaveType.insertMany(leaveTypesData);

    console.log('Seeding Departments...');
    const deptsData = [
      { name: 'HR', description: 'Human Resources' },
      { name: 'Engineering', description: 'Engineering & Tech' },
      { name: 'Finance', description: 'Finance & Accounting' },
      { name: 'Operations', description: 'Business Operations' },
    ];
    const departments = await Department.insertMany(deptsData);

    console.log('Seeding Employees...');
    const engDept = departments.find(d => d.name === 'Engineering');
    const hrDept = departments.find(d => d.name === 'HR');

    const employeesData = [
      {
        employeeId: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        nic: '199012345678',
        companyEmail: 'john.doe@company.com',
        department: engDept?._id,
        employmentType: 'Permanent',
      },
      {
        employeeId: 'EMP002',
        firstName: 'Jane',
        lastName: 'Smith',
        nic: '199298765432',
        companyEmail: 'jane.smith@company.com',
        department: hrDept?._id,
        employmentType: 'Permanent',
      },
      {
        employeeId: 'EMP003',
        firstName: 'Alice',
        lastName: 'Johnson',
        nic: '198511223344',
        companyEmail: 'alice.johnson@company.com',
        department: engDept?._id,
        employmentType: 'Permanent',
      },
      {
        employeeId: 'EMP004',
        firstName: 'Bob',
        lastName: 'Williams',
        nic: '198855667788',
        companyEmail: 'bob.williams@company.com',
        department: departments.find(d => d.name === 'Finance')?._id,
        employmentType: 'Contract',
      },
      {
        employeeId: 'EMP005',
        firstName: 'Charlie',
        lastName: 'Brown',
        nic: '199599887766',
        companyEmail: 'charlie.brown@company.com',
        department: departments.find(d => d.name === 'Operations')?._id,
        employmentType: 'Permanent',
      }
    ];

    const employees = await Employee.insertMany(employeesData);

    console.log('Seeding initial attendance & leave balances...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const emp of employees) {
      for (const lt of leaveTypes) {
        await LeaveBalance.create({
          employee: emp._id,
          leaveType: lt._id,
          year: today.getFullYear(),
          totalDays: lt.defaultDaysPerYear,
          usedDays: 0,
          pendingDays: 0,
        });
      }

      await AttendanceLog.create({
        employee: emp._id,
        date: today,
        clockIn: new Date(today.getTime() + 9 * 60 * 60 * 1000),
        clockOut: new Date(today.getTime() + 17 * 60 * 60 * 1000),
        workedHours: 8,
        status: 'Present'
      });
    }

    console.log('Creating SuperAdmin user in Primary DB...');
    let adminRole = await Role.findOne({ roleName: 'SuperAdmin' });
    if (!adminRole) {
      adminRole = await Role.create({ roleName: 'SuperAdmin', permissions: [] });
    }

    const adminEmail = 'admin@company.com';
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      await User.create({
        username: 'superadmin',
        fullName: 'Super Admin',
        email: adminEmail,
        password: 'Admin@123',
        phoneNumber: '0000000000',
        role: adminRole._id
      });
      console.log('SuperAdmin user created: admin@company.com / Admin@123');
    } else {
      console.log('SuperAdmin user already exists.');
    }

    console.log('HR Seeding Completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding HR data:', error);
    process.exit(1);
  }
};

seedHr();
