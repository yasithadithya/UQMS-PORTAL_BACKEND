import dotenv from 'dotenv';
import LeaveType from './HR/models/LeaveType';
import Department from './HR/models/Department';
import JobTitle from './HR/models/JobTitle';
import Employee from './HR/models/Employee';
import AttendanceLog from './HR/models/AttendanceLog';
import LeaveBalance from './HR/models/LeaveBalance';
import LeaveRequest from './HR/models/LeaveRequest';
import PublicHoliday from './HR/models/PublicHoliday';
import SalaryStructure from './HR/models/SalaryStructure';
import PayrollRun from './HR/models/PayrollRun';
import Announcement from './HR/models/Announcement';
import ReviewCycle from './HR/models/ReviewCycle';
import Goal from './HR/models/Goal';
import Appraisal from './HR/models/Appraisal';
import TrainingProgram from './HR/models/TrainingProgram';
import TrainingSession from './HR/models/TrainingSession';
import TrainingEnrollment from './HR/models/TrainingEnrollment';
import ChecklistTemplate from './HR/models/ChecklistTemplate';
import EmployeeChecklist from './HR/models/EmployeeChecklist';
import EmployeeDocument from './HR/models/EmployeeDocument';

import connectDB from './config/db';
import User from './models/User';
import Role from './models/Role';
import Module from './models/Module';

dotenv.config();

const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
};

const seedHr = async () => {
  try {
    console.log('Connecting to databases...');
    await connectDB();

    console.log('Clearing existing HR data...');
    await Promise.all([
      LeaveType.deleteMany({}),
      Department.deleteMany({}),
      JobTitle.deleteMany({}),
      Employee.deleteMany({}),
      AttendanceLog.deleteMany({}),
      LeaveBalance.deleteMany({}),
      LeaveRequest.deleteMany({}),
      PublicHoliday.deleteMany({}),
      SalaryStructure.deleteMany({}),
      PayrollRun.deleteMany({}),
      Announcement.deleteMany({}),
      ReviewCycle.deleteMany({}),
      Goal.deleteMany({}),
      Appraisal.deleteMany({}),
      TrainingProgram.deleteMany({}),
      TrainingSession.deleteMany({}),
      TrainingEnrollment.deleteMany({}),
      ChecklistTemplate.deleteMany({}),
      EmployeeChecklist.deleteMany({}),
      EmployeeDocument.deleteMany({}),
    ]);

    console.log('Seeding Leave Types...');
    const leaveTypesData = [
      { name: 'Annual', defaultDaysPerYear: 14, isPaidLeave: true, isCarryForwardAllowed: true, maxCarryForwardDays: 7 },
      { name: 'Sick', defaultDaysPerYear: 7, isPaidLeave: true },
      { name: 'Casual', defaultDaysPerYear: 7, isPaidLeave: true },
      { name: 'Maternity', defaultDaysPerYear: 84, isPaidLeave: true },
      { name: 'Paternity', defaultDaysPerYear: 3, isPaidLeave: true },
      { name: 'Unpaid', defaultDaysPerYear: 30, isPaidLeave: false },
    ];
    const leaveTypes = await LeaveType.insertMany(leaveTypesData);

    console.log('Seeding Departments & Job Titles...');
    const departments = await Department.insertMany([
      { name: 'HR', description: 'Human Resources' },
      { name: 'Engineering', description: 'Engineering & Tech' },
      { name: 'Finance', description: 'Finance & Accounting' },
      { name: 'Operations', description: 'Business Operations' },
    ]);

    const jobTitles = await JobTitle.insertMany([
      { title: 'Software Engineer', grade: 'G4', description: 'Builds and maintains software' },
      { title: 'Senior Software Engineer', grade: 'G5' },
      { title: 'HR Manager', grade: 'G6', description: 'Leads the HR function' },
      { title: 'Accountant', grade: 'G4' },
      { title: 'Operations Executive', grade: 'G3' },
    ]);

    const engDept = departments.find(d => d.name === 'Engineering');
    const hrDept = departments.find(d => d.name === 'HR');
    const finDept = departments.find(d => d.name === 'Finance');
    const opsDept = departments.find(d => d.name === 'Operations');
    const jt = (title: string) => jobTitles.find(j => j.title === title)?._id;

    console.log('Seeding Employees...');
    const thisYear = new Date().getFullYear();
    const employeesData = [
      {
        employeeId: 'EMP001', firstName: 'John', lastName: 'Doe', nic: '199012345678',
        companyEmail: 'john.doe@company.com', phone: '0771234567', gender: 'Male',
        department: engDept?._id, jobTitle: jt('Software Engineer'), employmentType: 'Permanent',
        dateOfBirth: new Date(1990, new Date().getMonth(), Math.min(28, new Date().getDate() + 5)),
        joinedDate: new Date(thisYear - 3, new Date().getMonth(), Math.min(28, new Date().getDate() + 10)),
        address: { street: '12 Lake Rd', city: 'Colombo', district: 'Colombo', province: 'Western', postalCode: '00300' },
        emergencyContact: { name: 'Mary Doe', relationship: 'Spouse', phone: '0777654321' },
      },
      {
        employeeId: 'EMP002', firstName: 'Jane', lastName: 'Smith', nic: '199298765432',
        companyEmail: 'jane.smith@company.com', phone: '0772223344', gender: 'Female',
        department: hrDept?._id, jobTitle: jt('HR Manager'), employmentType: 'Permanent',
        dateOfBirth: new Date(1992, 4, 14), joinedDate: new Date(thisYear - 5, 1, 1),
      },
      {
        employeeId: 'EMP003', firstName: 'Alice', lastName: 'Johnson', nic: '198511223344',
        companyEmail: 'alice.johnson@company.com', phone: '0773334455', gender: 'Female',
        department: engDept?._id, jobTitle: jt('Senior Software Engineer'), employmentType: 'Permanent',
        dateOfBirth: new Date(1985, 8, 2), joinedDate: new Date(thisYear - 6, 6, 15),
      },
      {
        employeeId: 'EMP004', firstName: 'Bob', lastName: 'Williams', nic: '198855667788',
        companyEmail: 'bob.williams@company.com', phone: '0774445566', gender: 'Male',
        department: finDept?._id, jobTitle: jt('Accountant'), employmentType: 'Contract',
        dateOfBirth: new Date(1988, 10, 20), joinedDate: new Date(thisYear - 1, 3, 1),
      },
      {
        employeeId: 'EMP005', firstName: 'Charlie', lastName: 'Brown', nic: '199599887766',
        companyEmail: 'charlie.brown@company.com', phone: '0775556677', gender: 'Male',
        department: opsDept?._id, jobTitle: jt('Operations Executive'), employmentType: 'Permanent',
        dateOfBirth: new Date(1995, 2, 8), joinedDate: new Date(thisYear, new Date().getMonth(), Math.min(28, new Date().getDate() + 20) ),
      },
    ];

    const employees = await Employee.insertMany(employeesData);
    const emp = (id: string) => employees.find(e => e.employeeId === id)!;

    // Jane (HR Manager) manages everyone
    await Employee.updateMany(
      { _id: { $ne: emp('EMP002')._id } },
      { reportsTo: emp('EMP002')._id }
    );

    console.log('Seeding Salary Structures...');
    const salaryData: [string, number][] = [
      ['EMP001', 250000], ['EMP002', 300000], ['EMP003', 350000], ['EMP004', 180000], ['EMP005', 150000],
    ];
    for (const [empId, basic] of salaryData) {
      await SalaryStructure.create({
        employee: emp(empId)._id,
        basicSalary: basic,
        allowances: [
          { name: 'Transport', amount: 15000, isTaxable: true },
          { name: 'Meal', amount: 10000, isTaxable: false },
        ],
        effectiveFrom: new Date(thisYear, 0, 1),
        isActive: true,
      });
    }

    console.log('Seeding Public Holidays (Sri Lanka)...');
    await PublicHoliday.insertMany([
      { date: new Date(thisYear, 1, 4), name: 'Independence Day', isRecurring: true },
      { date: new Date(thisYear, 3, 13), name: 'Sinhala & Tamil New Year Eve', isRecurring: true },
      { date: new Date(thisYear, 3, 14), name: 'Sinhala & Tamil New Year', isRecurring: true },
      { date: new Date(thisYear, 4, 1), name: 'May Day', isRecurring: true },
      { date: new Date(thisYear, 11, 25), name: 'Christmas Day', isRecurring: true },
    ]);

    console.log('Seeding attendance & leave balances...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const e of employees) {
      for (const lt of leaveTypes) {
        await LeaveBalance.create({
          employee: e._id,
          leaveType: lt._id,
          year: today.getFullYear(),
          totalDays: lt.defaultDaysPerYear,
          usedDays: 0,
          pendingDays: 0,
        });
      }

      await AttendanceLog.create({
        employee: e._id,
        date: today,
        clockIn: new Date(today.getTime() + 9 * 60 * 60 * 1000),
        clockOut: new Date(today.getTime() + 17 * 60 * 60 * 1000),
        workedHours: 8,
        status: 'Present',
      });
    }

    console.log('Seeding a pending leave request...');
    const annual = leaveTypes.find(lt => lt.name === 'Annual')!;
    const pendingStart = daysFromNow(14);
    const pendingEnd = daysFromNow(15);
    await LeaveRequest.create({
      employee: emp('EMP001')._id,
      leaveType: annual._id,
      startDate: pendingStart,
      endDate: pendingEnd,
      totalDays: 2,
      reason: 'Family event',
      status: 'Pending',
    });
    await LeaveBalance.findOneAndUpdate(
      { employee: emp('EMP001')._id, leaveType: annual._id, year: today.getFullYear() },
      { $inc: { pendingDays: 2 } }
    );

    console.log('Seeding Performance data...');
    const cycle = await ReviewCycle.create({
      name: `Annual Review ${thisYear}`,
      type: 'Annual',
      periodStart: new Date(thisYear, 0, 1),
      periodEnd: new Date(thisYear, 11, 31),
      status: 'Open',
    });

    await Goal.insertMany([
      { employee: emp('EMP001')._id, cycle: cycle._id, title: 'Ship HR module v2', kpi: 'Features delivered', targetValue: '10', weight: 40, progress: 60, status: 'InProgress', dueDate: new Date(thisYear, 11, 1) },
      { employee: emp('EMP001')._id, cycle: cycle._id, title: 'Reduce bug backlog', kpi: 'Open bugs', targetValue: '< 20', weight: 30, progress: 25, status: 'InProgress' },
      { employee: emp('EMP003')._id, cycle: cycle._id, title: 'Mentor two junior engineers', weight: 20, progress: 50, status: 'InProgress' },
    ]);

    await Appraisal.create({
      employee: emp('EMP001')._id,
      cycle: cycle._id,
      reviewer: emp('EMP002')._id,
      ratings: [
        { criteria: 'Quality of Work', rating: 4, comments: 'Consistently solid output' },
        { criteria: 'Productivity', rating: 4 },
        { criteria: 'Teamwork', rating: 5, comments: 'Great collaborator' },
      ],
      strengths: 'Strong technical skills, reliable delivery',
      areasForImprovement: 'Documentation could be more thorough',
      status: 'Draft',
    });

    console.log('Seeding Training data...');
    const program = await TrainingProgram.create({
      name: 'Fire & Safety Fundamentals',
      description: 'Mandatory annual fire safety and evacuation training',
      category: 'Safety',
      provider: 'SafeCo Lanka',
      durationHours: 4,
    });
    const session = await TrainingSession.create({
      program: program._id,
      startDate: daysFromNow(10),
      trainer: 'K. Perera',
      location: 'Head Office - Training Room',
      capacity: 20,
      status: 'Scheduled',
    });
    await TrainingEnrollment.insertMany([
      { session: session._id, employee: emp('EMP001')._id, status: 'Enrolled' },
      { session: session._id, employee: emp('EMP005')._id, status: 'Enrolled' },
    ]);

    console.log('Seeding Checklist templates...');
    await ChecklistTemplate.insertMany([
      {
        name: 'Standard Onboarding',
        type: 'Onboarding',
        items: [
          { title: 'Sign employment contract', dueOffsetDays: 0 },
          { title: 'Create company email & system accounts', dueOffsetDays: 0 },
          { title: 'Issue laptop and access card', dueOffsetDays: 1 },
          { title: 'HR policies orientation', dueOffsetDays: 3 },
          { title: 'Department introduction & buddy assignment', dueOffsetDays: 7 },
        ],
      },
      {
        name: 'Standard Offboarding',
        type: 'Offboarding',
        items: [
          { title: 'Collect resignation/termination letter', dueOffsetDays: 0 },
          { title: 'Knowledge handover', dueOffsetDays: 7 },
          { title: 'Return laptop, access card, and assets', dueOffsetDays: 14 },
          { title: 'Revoke system access', dueOffsetDays: 14 },
          { title: 'Final settlement & exit interview', dueOffsetDays: 21 },
        ],
      },
    ]);

    console.log('Seeding Announcements...');
    await Announcement.insertMany([
      {
        title: 'Welcome to the new HR portal',
        body: 'The HR module now covers attendance, leave, payroll, performance reviews, training, and self-service. Explore the tabs above.',
        priority: 'Important',
        publishDate: new Date(),
      },
      {
        title: 'Office closed on May Day',
        body: 'The office will remain closed on May 1st. Wishing everyone a restful holiday.',
        priority: 'Normal',
        publishDate: new Date(),
      },
    ]);

    // ---------- Primary DB: users, roles, permissions ----------

    console.log('Ensuring SuperAdmin user & permissions in Primary DB...');
    let adminRole = await Role.findOne({ roleName: 'SuperAdmin' });
    if (!adminRole) {
      adminRole = await Role.create({ roleName: 'SuperAdmin', permissions: [] });
    }
    // Grant SuperAdmin every action on every module (the boot-time seeder only does this for a role literally named 'admin')
    const allModules = await Module.find();
    if (allModules.length > 0) {
      adminRole.permissions = allModules.map(mod => ({
        module: mod._id as any,
        actions: ['create', 'read', 'update', 'delete'],
      })) as any;
      await adminRole.save();
    }

    const adminEmail = 'admin@company.com';
    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      adminUser = await User.create({
        username: 'superadmin',
        fullName: 'Super Admin',
        email: adminEmail,
        password: 'Admin@123',
        phoneNumber: '0000000000',
        role: adminRole._id,
      });
      console.log('SuperAdmin user created: admin@company.com / Admin@123');
    } else {
      console.log('SuperAdmin user already exists.');
    }

    console.log('Creating ESS test user (read-only HR) in Primary DB...');
    const hrModule = await Module.findOne({ name: { $regex: /^hr$/i } });
    let essRole = await Role.findOne({ roleName: 'HR-Employee' });
    if (!essRole) {
      essRole = await Role.create({
        roleName: 'HR-Employee',
        permissions: hrModule ? [{ module: hrModule._id, actions: ['read'] }] : [],
      });
    } else if (hrModule) {
      essRole.permissions = [{ module: hrModule._id, actions: ['read'] }] as any;
      await essRole.save();
    }

    const essEmail = 'employee@company.com';
    let essUser = await User.findOne({ email: essEmail });
    if (!essUser) {
      essUser = await User.create({
        username: 'john.doe',
        fullName: 'John Doe',
        email: essEmail,
        password: 'Employee@123',
        phoneNumber: '0771234567',
        role: essRole._id,
      });
      console.log('ESS user created: employee@company.com / Employee@123');
    } else {
      console.log('ESS user already exists.');
    }

    console.log('Linking employees to user accounts (self-service)...');
    await Employee.findByIdAndUpdate(emp('EMP002')._id, { userId: String(adminUser._id) });
    await Employee.findByIdAndUpdate(emp('EMP001')._id, { userId: String(essUser._id) });

    console.log('HR Seeding Completed!');
    console.log('  Admin login: admin@company.com / Admin@123  (full HR admin, linked to EMP002)');
    console.log('  ESS login:   employee@company.com / Employee@123  (My HR only, linked to EMP001)');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding HR data:', error);
    process.exit(1);
  }
};

seedHr();
