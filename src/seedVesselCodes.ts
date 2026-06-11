import mongoose from 'mongoose';
import dotenv from 'dotenv';
import VesselCode from './models/VesselCode';

dotenv.config();

const vesselCodes = [
  { code: 'IVCC', description: 'Internal Waters Craft Code' },
  { code: 'SSC', description: 'Small Craft Code' },
  { code: 'LYC', description: 'Large Yacht Code' },
  { code: 'LCC', description: 'Large Non-Conventional Code' },
];

const seedVesselCodes = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    const result = await VesselCode.bulkWrite(
      vesselCodes.map((item) => ({
        updateOne: {
          filter: { code: item.code },
          update: { $set: item },
          upsert: true,
        },
      }))
    );

    console.log('🌱 Seeded vessel codes:', result.upsertedCount + result.modifiedCount);
    console.log('🎉 Vessel codes seed completed successfully!\n');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Vessel codes seed error:', error.message || error);
    process.exit(1);
  }
};

seedVesselCodes();
