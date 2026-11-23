import { env } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './db/pool.js';
import { startJobs, stopJobs } from './jobs/escalation.job.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Travel & Reimbursement API listening on :${env.PORT} (${env.NODE_ENV})`);
  startJobs();
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  stopJobs();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
