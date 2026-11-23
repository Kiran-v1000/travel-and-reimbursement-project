import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './config/env.js';
import { prisma } from './db/pool.js';
import { authenticate, errorHandler, notFoundHandler } from './shared/middlewares/index.js';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import travelRoutes from './modules/travel/travel.routes.js';
import expenseRoutes from './modules/expenses/expenses.routes.js';
import approvalRoutes from './modules/approvals/approvals.routes.js';
import financeRoutes from './modules/finance/finance.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import attachmentRoutes from './modules/attachments/attachments.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import reportRoutes from './modules/reports/reports.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';

/** Build the Express app (no listening here - see server.js). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL.split(',').map((s) => s.trim()), credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(morgan(isProd ? 'combined' : 'dev'));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', authenticate);
  app.use('/api/users', userRoutes);
  app.use('/api/travel', travelRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/approvals', approvalRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/audit', auditRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
