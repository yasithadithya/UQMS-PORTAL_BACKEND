import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DocumentTemplate from './models/DocumentTemplate';
import { DEFAULT_DOCUMENT_TEMPLATES } from './services/documentTemplateService';

dotenv.config();

// Placeholder templates from an earlier seed that no PDF uses: the daily report has no
// controlled footer and the survey findings summary is a section of the docking statement.
const obsoleteDocumentNames = ['Daily Visit Report', 'Survey Findings Summary'];

const seedDocumentTemplates = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    const result = await DocumentTemplate.bulkWrite(
      DEFAULT_DOCUMENT_TEMPLATES.map((item) => ({
        updateOne: {
          filter: { documentName: item.documentName },
          update: { $set: item },
          upsert: true,
        },
      }))
    );

    const removed = await DocumentTemplate.deleteMany({ documentName: { $in: obsoleteDocumentNames } });

    console.log('🌱 Seeded document templates:', result.upsertedCount + result.modifiedCount);
    console.log('🗑️  Removed obsolete document templates:', removed.deletedCount);
    console.log('🎉 Document templates seed completed successfully!\n');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Document templates seed error:', error.message || error);
    process.exit(1);
  }
};

seedDocumentTemplates();
