import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { redactUrl } from './shared/utils/redact.js';
import { env, isProd } from './config/env.js';
import { apiLimiter } from './shared/middlewares/rateLimits.js';
import { prisma } from './db/pool.js';
import { authenticate, errorHandler, notFoundHandler } from './shared/middlewares/index.js';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import travelRoutes from './modules/travel/travel.routes.js';
import expenseRoutes from './modules/expenses/expenses.routes.js';
import approvalRoutes from './modules/approvals/approvals.routes.js';
import financeRoutes from './modules/finance/finance.routes.js';
import complianceRoutes from './modules/compliance/compliance.routes.js';
import orgRoutes from './modules/org/org.routes.js';
import helpRoutes from './modules/help/help.routes.js';
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
  if (env.REQUEST_LOGGING) {
    // Request logs never carry sign-in codes, tokens or other secrets that can appear in a
    // query string (e.g. Microsoft's ?code=... on the sign-in callback) or in the Referer.
    morgan.token('safe-url', (req) => redactUrl(req.originalUrl || req.url));
    morgan.token('safe-referrer', (req) => redactUrl(req.headers.referer || req.headers.referrer || ''));
    app.use(
      morgan(
        isProd
          ? ':remote-addr - [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":safe-referrer" ":user-agent"'
          : ':method :safe-url :status :response-time ms - :res[content-length]',
      ),
    );
  }
  app.use('/api', apiLimiter);

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
  app.use('/api/compliance', complianceRoutes);
  app.use('/api/org', orgRoutes);
  app.use('/api/help', helpRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/audit', auditRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
