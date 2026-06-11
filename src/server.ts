import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import connectDB from './config/db';
import swaggerSpec from './config/swagger';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import roleRoutes from './routes/roleRoutes';
import moduleRoutes from './routes/moduleRoutes';
import uploadRoutes from './routes/uploadRoutes';
import operationsRoutes from './routes/operationsRoutes';
import requestRoutes from './routes/requestRoutes';
import vesselRoutes from './routes/vesselRoutes';
import vesselCodeRoutes from './routes/vesselCodeRoutes';
import firstEntryRoutes from './routes/firstEntryRoutes';
import firstEntrySurveyBookingRoutes from './routes/firstEntrySurveyBookingRoutes';
import firstEntrySurveyReportRoutes from './routes/firstEntrySurveyReportRoutes';
import firstEntryFullReportRoutes from './routes/firstEntryFullReportRoutes';
import checklistQuestionRoutes from './routes/checklistQuestionRoutes';
import { seedModulesAndAdminPermissions } from './config/seedModules';
import { formatDate } from './utils/date';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'UQMS API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/vessel-codes', vesselCodeRoutes);
app.use('/api/first-entries', firstEntryRoutes);
app.use('/api/first-entry-survey-bookings', firstEntrySurveyBookingRoutes);
app.use('/api/first-entry-survey-reports', firstEntrySurveyReportRoutes);
app.use('/api/first-entry-full-reports', firstEntryFullReportRoutes);
app.use('/api/checklist-questions', checklistQuestionRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'UQMS API is running',
    timestamp: formatDate(),
  });
});

// Root redirect to API docs
app.get('/', (_req, res) => {
  res.redirect('/api-docs');
});

// Connect to MongoDB and start server
const startServer = async () => {
  await connectDB();
  await seedModulesAndAdminPermissions();

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 Swagger docs at http://localhost:${PORT}/api-docs`);
    console.log(`❤️  Health check at http://localhost:${PORT}/api/health\n`);
  });
};

startServer();

export default app;
