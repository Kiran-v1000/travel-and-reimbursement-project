import cron from 'node-cron';
import { env } from '../config/env.js';
import { prisma } from '../db/pool.js';
import { escalateOverdue } from '../modules/approvals/approvals.service.js';
import { warmOrgAnalytics, precomputeAnalytics } from '../modules/reports/reports.service.js';
import { scheduledRun as retentionRun } from '../modules/compliance/compliance.retention.service.js';
import { purgeOldSessions } from '../modules/auth/auth.sessions.js';

const tasks = [];

/**
 * Background jobs. Safe to run on every API instance at once: escalation claims rows with
 * FOR UPDATE SKIP LOCKED, and cleanup deletes in small batches.
 */
export function startJobs() {
  if (!cron.validate(env.ESCALATION_CRON)) {
    console.warn(`[jobs] invalid ESCALATION_CRON "${env.ESCALATION_CRON}", escalation disabled`);
  } else {
    tasks.push(
      cron.schedule(env.ESCALATION_CRON, async () => {
        try {
          const n = await escalateOverdue();
          if (n) console.log(`[jobs] escalated ${n} overdue approval step(s)`);
        } catch (err) {
          console.error('[jobs] escalation failed', err.message);
        }
      }),
    );
  }

  // Keep organisation-wide analytics warm so Finance / leadership never wait on a cold report.
  const warm = () => warmOrgAnalytics().catch((err) => console.error('[jobs] analytics warm-up failed', err.message));
  setTimeout(warm, 20_000).unref();
  tasks.push(cron.schedule('*/5 * * * *', warm));

  // Nightly: drop read notifications older than 180 days, 5k rows at a time.
  tasks.push(
    cron.schedule('17 2 * * *', async () => {
      try {
        let total = 0;
        for (;;) {
          const n = await prisma.$executeRaw`
            DELETE FROM "Notification" WHERE id IN (
              SELECT id FROM "Notification" WHERE "read" = true AND "createdAt" < now() - interval '180 days' LIMIT 5000)`;
          total += n;
          if (n < 5000) break;
        }
        if (total) console.log(`[jobs] removed ${total} old notifications`);
      } catch (err) {
        console.error('[jobs] notification cleanup failed', err.message);
      }
    }),
  );

  // Nightly: rebuild year-to-date analytics for the organisation and every large team, so the
  // first person to open them in the morning does not wait. One server per night does it.
  tasks.push(
    cron.schedule('20 3 * * *', async () => {
      try {
        const r = await precomputeAnalytics();
        if (r) console.log(`[jobs] analytics precomputed for ${r.built}/${r.scopes} scope(s) in ${Math.round(r.ms / 1000)}s, ${r.removed} old snapshot(s) removed`);
      } catch (err) {
        console.error('[jobs] analytics precompute failed', err.message);
      }
    }),
  );

  // Nightly: drop session rows that ended more than 30 days ago.
  tasks.push(
    cron.schedule('5 3 * * *', async () => {
      try {
        const n = await purgeOldSessions();
        if (n) console.log(`[jobs] removed ${n} old session record(s)`);
      } catch (err) {
        console.error('[jobs] session cleanup failed', err.message);
      }
    }),
  );

  // Nightly retention purge - only when an administrator has switched automatic purging on.
  tasks.push(
    cron.schedule('43 2 * * *', async () => {
      try {
        const run = await retentionRun();
        if (run) console.log(`[jobs] retention purged ${run.expenses} report(s), ${run.trips} trip(s), ${run.files} file(s)`);
      } catch (err) {
        console.error('[jobs] retention run failed', err.message);
      }
    }),
  );
}

export function stopJobs() {
  tasks.forEach((t) => t.stop());
}
