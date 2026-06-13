import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import Role from './models/Role';
import User from './models/User';
import DocumentNumber from './models/DocumentNumber';

dotenv.config();

const seedData = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Role.deleteMany({});
    await User.deleteMany({});
    console.log('🗑️  Cleared existing roles and users');

    // Create default roles
    const roles = await Role.insertMany([
      { roleName: 'admin' },
      { roleName: 'user' },
      { roleName: 'manager' },
    ]);
    console.log('✅ Created default roles:', roles.map(r => r.roleName).join(', '));

    const adminRole = roles.find(r => r.roleName === 'admin');

    // // Create default admin user
    // const salt = await bcrypt.genSalt(10);
    // const hashedPassword = await bcrypt.hash('admin123', salt);

    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@shipping.com',
      password: 'admin123',
      role: adminRole!._id,
      fullName: 'Administrator',
      phoneNumber: '0000000000',
    });
    console.log(`✅ Created admin user: ${adminUser.email} (password: admin123)`);

    await DocumentNumber.findOneAndUpdate(
      { name: 'request' },
      {
        $setOnInsert: {
          name: 'request',
          prefix: 'RQ',
          digits: 4,
          lastNumber: -1,
        },
      },
      { upsert: true, new: true }
    );
    console.log('Created document number config: request (RQ####)');

    console.log('\n🎉 Seed completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedData();
