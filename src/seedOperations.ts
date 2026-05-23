import mongoose from 'mongoose';
import dotenv from 'dotenv';
import VesselType from './models/VesselType';
import AreaOfOperation from './models/AreaOfOperation';
import SurveyType from './models/SurveyType';

dotenv.config();

const vesselTypes = [
  { group: 'Group 1', name: 'Passenger Vessels' },
  { group: 'Group 2', name: 'Cargo Vessels' },
  { group: 'Group 3', name: 'Vessels in commercial use for sport or pleasure' },
  { group: 'Group 4', name: 'Vessels in private use for sport or pleasure (not for hire)' },
  { group: 'Group 5', name: 'Work boats' },
  { group: 'Group 6', name: 'Pilot Boats' },
];

const areaOperations = [
  { AreaCategory: '0', description: 'Unrestricted Seagoing service' },
  {
    AreaCategory: '0R',
    description: 'Restricted Seagoing service, to sea up to 200 nautical miles from a nominated point of departure',
  },
  {
    AreaCategory: '1',
    description: 'At sea up to 150 nautical miles from a safe haven and within 24 nautical miles from the coastline',
  },
  {
    AreaCategory: '2',
    description: 'At sea up to 60 nautical miles from a safe haven and within 24 nautical miles from the coastline',
  },
  {
    AreaCategory: '3',
    description: 'At sea up to 30 nautical miles from a safe haven and within 24 nautical miles from the coastline',
  },
  {
    AreaCategory: '4',
    description:
      'At sea up to 20 nautical miles from a nominated point of departure in sea conditions corresponding to the vessels design category, operation within 12 nautical miles from the coastline',
  },
  {
    AreaCategory: '5',
    description:
      'At sea up to 12 nautical miles from a nominated point of departure in sea conditions corresponding to the vessels design category, operation within 12 nautical miles from the coastline',
  },
  {
    AreaCategory: '6',
    description:
      'Tidal rivers, estuaries, lagoons, bays and inlets where the significant wave height could not be expected to exceed 2.0m at any time',
  },
  {
    AreaCategory: '7',
    description:
      'Tidal rivers, estuaries, lagoons, bays, inlets and large deep inland lakes where the significant wave height could not be expected to exceed 1.2 m at any time',
  },
  {
    AreaCategory: '8',
    description:
      'Wide rivers, canals and small inland lakes where the depth of water is generally 1.5 m or more and where the significant wave height could not be expected to exceed 0.6 m at any time',
  },
  {
    AreaCategory: '9',
    description:
      'Narrow rivers and canals where the depth of water is generally less than 1.5 m',
  },
];

const surveyTypes = [
  { code: 'ST01', name: 'Initial survey' },
  { code: 'ST02', name: 'Annual survey' },
  { code: 'ST03', name: 'Intermediate survey' },
  { code: 'ST04', name: 'Renewal survey' },
  { code: 'ST05', name: 'Docking survey' },
  { code: 'ST06', name: 'Occasional survey' },
  { code: 'ST07', name: 'Condition survey' },
  { code: 'ST08', name: 'In water survey' },
  { code: 'ST09', name: 'Draft survey' },
  { code: 'ST10', name: 'Bunker survey' },
  { code: 'ST11', name: 'Cargo Gear Load Test and Crane Survey' },
  { code: 'ST12', name: 'Pre-Purchase Survey' },
  { code: 'ST13', name: 'On/Off Hire Survey' },
  { code: 'ST14', name: 'Damage Survey' },
  { code: 'ST15', name: 'Insurance Survey' },
  { code: 'ST16', name: 'Boiler & Pressure Vessel Survey' },
  { code: 'ST17', name: 'Load Line Survey' },
  { code: 'ST18', name: 'Cargo Ship Safety Construction Survey' },
  { code: 'ST19', name: 'Cargo Ship Safety Equipment Survey' },
  { code: 'ST20', name: 'Cargo Ship Safety Radio Survey' },
  { code: 'ST21', name: 'IOPP Survey (Oil Pollution Prevention)' },
  { code: 'ST22', name: 'ISPP Survey (Sewage Pollution Prevention)' },
  { code: 'ST23', name: 'IAPP Survey (Air Pollution Prevention)' },
  { code: 'ST24', name: 'Ballast Water Management Survey' },
  { code: 'ST25', name: 'MLC Inspection' },
  { code: 'ST26', name: 'ISPS Verification' },
  { code: 'ST27', name: 'DOC & SMC Audit' },
  { code: 'ST28', name: 'ISO Audits' },
];

const seedOperations = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');

    const vesselResult = await VesselType.bulkWrite(
      vesselTypes.map((item) => ({
        updateOne: {
          filter: { group: item.group },
          update: { $set: item },
          upsert: true,
        },
      }))
    );

    const areaResult = await AreaOfOperation.bulkWrite(
      areaOperations.map((item) => ({
        updateOne: {
          filter: { AreaCategory: item.AreaCategory },
          update: { $set: item },
          upsert: true,
        },
      }))
    );

    const surveyResult = await SurveyType.bulkWrite(
      surveyTypes.map((item) => ({
        updateOne: {
          filter: { code: item.code },
          update: { $set: item },
          upsert: true,
        },
      }))
    );

    console.log('Seeded vessel types:', vesselResult.upsertedCount + vesselResult.modifiedCount);
    console.log('Seeded area operations:', areaResult.upsertedCount + areaResult.modifiedCount);
    console.log('Seeded survey types:', surveyResult.upsertedCount + surveyResult.modifiedCount);
    process.exit(0);
  } catch (error: any) {
    console.error('Seed error:', error.message || error);
    process.exit(1);
  }
};

seedOperations();
