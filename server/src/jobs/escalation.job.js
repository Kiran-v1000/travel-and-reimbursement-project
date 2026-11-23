import cron from 'node-cron';
import { env } from '../config/env.js';
import { escalateOverdue } from '../modules/approvals/approvals.service.js';

let task = null;

/** Escalate or remind on approval steps that passed their timeout. */
export function startJobs() {
  if (!cron.validate(env.ESCALATION_CRON)) {
    console.warn(`[jobs] invalid ESCALATION_CRON "${env.ESCALATION_CRON}", escalation disabled`);
    return;
  }
  task = cron.schedule(env.ESCALATION_CRON, async () => {
    try {
      const n = await escalateOverdue();
      if (n) console.log(`[jobs] escalated ${n} overdue approval step(s)`);
    } catch (err) {
      console.error('[jobs] escalation failed', err.message);
    }
  });
}

export function stopJobs() {
  task?.stop();
}
