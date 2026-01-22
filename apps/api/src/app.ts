import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { apiLimiter } from './middleware/rate-limit';

// Import routes
import authRoutes from './routes/auth';
import pollRoutes from './routes/polls';
import voteRoutes from './routes/votes';
import commentRoutes from './routes/comments';
import commitmentRoutes from './routes/commitments';
import tenantRoutes from './routes/tenants';
import auditRoutes from './routes/audit';
import consultationRoutes from './routes/consultations';
import documentRoutes from './routes/documents';
import adminRoutes from './routes/admin';
import moderationRoutes from './routes/moderation';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug'],
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Rate limiting
  app.use('/api/', apiLimiter);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/polls', pollRoutes);
  app.use('/api/polls', voteRoutes);  // Vote routes: /api/polls/:pollId/vote, /api/polls/:pollId/results
  app.use('/api/polls', commentRoutes);  // Comment routes: /api/polls/:pollId/comments
  app.use('/api/commitments', commitmentRoutes);
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/consultations', consultationRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/moderation', moderationRoutes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
