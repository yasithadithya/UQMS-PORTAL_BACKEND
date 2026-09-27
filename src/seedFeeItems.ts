import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FeeItem, { IFeeItem } from './models/FeeItem';

dotenv.config();

/**
 * Fee Structure for Surveys (Internal Waters Craft Code and Small Craft Code certificates).
 * `rate` is the current prevailing fee after the 30% discount; `standardRate` is the list fee.
 */
type FeeItemSeed = Pick<IFeeItem, 'name' | 'category' | 'currency' | 'rate' | 'unit' | 'order'> & Partial<Pick<IFeeItem, 'standardRate' | 'notes'>>;

const feeItems: FeeItemSeed[] = [
  { name: 'Initial / renewal survey (special)', category: 'survey', currency: 'USD', standardRate: 650, rate: 450, unit: 'visit', order: 1 },
  { name: 'Docking survey', category: 'survey', currency: 'USD', standardRate: 700, rate: 490, unit: 'visit', order: 2 },
  { name: 'Under water inspection for intermediate survey', category: 'survey', currency: 'USD', standardRate: 700, rate: 490, unit: 'visit', order: 3 },
  { name: 'Annual survey', category: 'survey', currency: 'USD', standardRate: 500, rate: 350, unit: 'visit', order: 4 },
  { name: 'Occasional survey', category: 'survey', currency: 'USD', standardRate: 350, rate: 250, unit: 'visit', order: 5 },

  { name: 'Additional visit', category: 'additional', currency: 'USD', rate: 150, unit: 'visit', order: 1 },
  { name: 'Travel time', category: 'additional', currency: 'USD', rate: 25, unit: 'hour', notes: 'Two hours free', order: 2 },
  { name: 'Additional charges Trincomalee (travel time etc.)', category: 'additional', currency: 'LKR', rate: 75000, unit: 'lump sum', notes: '12 hrs', order: 3 },
  { name: 'Additional charges Hambantota (travel time etc.)', category: 'additional', currency: 'LKR', rate: 45000, unit: 'lump sum', notes: '8 hrs', order: 4 },
  { name: 'Additional charges Jaffna (travel time etc.)', category: 'additional', currency: 'LKR', rate: 120000, unit: 'lump sum', notes: '18 hrs', order: 5 },

  { name: 'Transportation charges - Colombo', category: 'transport', currency: 'LKR', rate: 2500, unit: 'trip', order: 1 },
  { name: 'Transportation charges - Dikkowita', category: 'transport', currency: 'LKR', rate: 4000, unit: 'trip', order: 2 },
  { name: 'Transportation charges - Negombo', category: 'transport', currency: 'LKR', rate: 12000, unit: 'trip', order: 3 },
  { name: 'Transportation charges - Galle', category: 'transport', currency: 'LKR', rate: 35000, unit: 'trip', order: 4 },
  { name: 'Transportation charges - Trincomalee', category: 'transport', currency: 'LKR', rate: 76000, unit: 'trip', order: 5 },
  { name: 'Transportation charges - Hambantota', category: 'transport', currency: 'LKR', rate: 68000, unit: 'trip', order: 6 },
  { name: 'Transportation charges - Jaffna', category: 'transport', currency: 'LKR', rate: 113400, unit: 'trip', order: 7 },
];

const seedFeeItems = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // $setOnInsert: re-running the seed never overwrites fees edited in the portal.
    const result = await FeeItem.bulkWrite(
      feeItems.map((item) => ({
        updateOne: {
          filter: { name: item.name },
          update: { $setOnInsert: item },
          upsert: true,
        },
      }))
    );

    console.log('🌱 Seeded fee items:', result.upsertedCount);
    console.log('🎉 Fee structure seed completed successfully!\n');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fee structure seed error:', error.message || error);
    process.exit(1);
  }
};

seedFeeItems();
