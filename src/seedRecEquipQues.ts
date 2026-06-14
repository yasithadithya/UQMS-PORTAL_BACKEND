import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RecEquipQues from './models/RecEquipQues';

dotenv.config();

const recEquipQuesList = [
  // 11.4
  { codeRefNo: '11.4', description: 'Total number of Life rafts (Total number of persons accommodated)' },

  // 11.2
  { codeRefNo: '11.2', description: 'Total Number of Lifebuoys' },
  { codeRefNo: '11.2', description: 'Number of Lifebuoys with Dan-buoy' },
  { codeRefNo: '11.2', description: 'Number of Lifebuoys with Dan-buoy light' },
  { codeRefNo: '11.2', description: 'Number of Lifebuoys with light' },
  { codeRefNo: '11.2', description: 'Number of Lifebuoys with buoyant line' },
  { codeRefNo: '11.2', description: 'Number of Lifebuoys without attachments' },
  { codeRefNo: '11.2', description: 'Additional Buoyant Line' },

  // 11.3
  { codeRefNo: '11.3', description: 'Number of Adult Life jackets & Type' },
  { codeRefNo: '11.3', description: 'Number of Child Life jackets & Type' },

  // 11.5
  { codeRefNo: '11.5', description: 'Number of Thermal protective aids' },

  // 11.6
  { codeRefNo: '11.6', description: 'EPIRB' },
  { codeRefNo: '11.6', description: 'SART' },

  // 11.10
  { codeRefNo: '11.10', description: 'Number of Parachute flares' },
  { codeRefNo: '11.10', description: 'Number of Red hand flares' },
  { codeRefNo: '11.10', description: 'Number of Smoke Signals (Buoyant/hand-held)' },
  { codeRefNo: '11.10', description: 'Line throwing apparatus' },
  { codeRefNo: '11.10', description: 'General Alarm' },

  // 11.11
  { codeRefNo: '11.11', description: 'Tenders/ Rescue boats' },
  { codeRefNo: '11.11', description: 'Life Saving signals table' },

  // 11.7
  { codeRefNo: '11.7', description: 'Instructions for onboard maintenance of life saving equipment' },

  // 11.8
  { codeRefNo: '11.8', description: 'Training manuals' },
  { codeRefNo: '11.8', description: 'Number of Portable fire extinguishers & Type' },
  { codeRefNo: '11.8', description: 'Fire Pumps (Hand/ Power driven)' },
  { codeRefNo: '11.8', description: 'Fix Fire Extinguishers System' },
  { codeRefNo: '11.8', description: 'Number of Fire hoses with spray nozzles' },
  { codeRefNo: '11.8', description: 'Fire blanket' },
  { codeRefNo: '11.8', description: 'Fire buckets with lanyards' },

  // 13.1
  { codeRefNo: '13.1', description: 'VHF Fixed radio installation' },
  { codeRefNo: '13.1', description: 'Portable waterproof VHF' },
  { codeRefNo: '13.1', description: 'MF SSB Radio installation with DSC' },
  { codeRefNo: '13.1', description: 'MF/HF Transceiver with DSC' },
  { codeRefNo: '13.1', description: 'Inmarsat Ship earth Station' },
  { codeRefNo: '13.1', description: 'NAVTEX receiver' },
  { codeRefNo: '13.1', description: 'Battery Back Up' },
  { codeRefNo: '13.1', description: 'AIS' },
  { codeRefNo: '13.1', description: 'Radars' },
  { codeRefNo: '13.1', description: 'Magnetic Compass' },
  { codeRefNo: '13.1', description: 'Daylight signaling lamp' },
  { codeRefNo: '13.1', description: 'Navigation Charts for Operating area' },
  { codeRefNo: '13.1', description: 'Navigation lights' }
];

const seedRecEquipQues = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    const result = await RecEquipQues.bulkWrite(
      recEquipQuesList.map((item) => ({
        updateOne: {
          filter: { codeRefNo: item.codeRefNo, description: item.description },
          update: { $set: item },
          upsert: true,
        },
      }))
    );

    console.log('🌱 Seeded recommended equipment questions:', result.upsertedCount + result.modifiedCount);
    console.log('🎉 RecEquipQues seed completed successfully!\n');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ RecEquipQues seed error:', error.message || error);
    process.exit(1);
  }
};

seedRecEquipQues();
