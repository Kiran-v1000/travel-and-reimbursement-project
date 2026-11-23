/**
 * Data retention. Closed records older than the retention period (Policy → Record retention,
 * 8 years by default) are purged:
 *  - receipt files are deleted from storage;
 *  - personal text (titles, purposes, merchants, notes, approver comments, traveller names,
 *    revision snapshots) is removed;
 *  - codes, dates, amounts, categories, cost centers and payments are kept, so totals,
 *    analytics, accounting exports and the audit trail still add up.
 * Records under legal hold are skipped. In-flight records (pending, in Finance review,
 * scheduled) are never touched.
 *
 * Runs nightly only when "retentionAutoPurge" is on, or when an administrator starts it.
 * One run at a time across all servers (partial unique index on RetentionRun.status).
 * Each batch takes the hold lock, so a hold placed mid-run takes effect immediately.
 */
import path from 'node:path';
import fs from 'node:fs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/pool.js';
import { conflict } from '../../shared/errors/AppError.js';
import { getSetting } from '../../shared/utils/index.js';
import { audit } from '../audit/audit.service.js';
import { uploadDir } from '../attachments/attachments.service.js';
import { HOLD_LOCK, heldSql } from './compliance.holds.service.js';

const BATCH = 200;
const PURGED = 'Purged record';
const STALE_MS = 6 * 3600_000;

export function cutoffFor(years, now = new Date()) {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - Number(years));
  return d;
}

// Closed = nothing left to happen to it. A report counts from its payment date (or last change).
const expenseBase = (cutoff) => Prisma.sql`
  r."purgedAt" IS NULL
  AND r.status IN ('DRAFT', 'RETURNED', 'PAID', 'REJECTED', 'WITHDRAWN')
  AND COALESCE(p."paidAt", r."updatedAt") < ${cutoff}`;

// A trip counts from when it ended (or last changed), and waits until its expense reports are purged.
const travelBase = (cutoff) => Prisma.sql`
  t."purgedAt" IS NULL
  AND t.status IN ('DRAFT', 'RETURNED', 'APPROVED', 'REJECTED', 'WITHDRAWN')
  AND GREATEST(t."endDate", t."updatedAt") < ${cutoff}
  AND NOT EXISTS (SELECT 1 FROM "ExpenseReport" e WHERE e."travelRequestId" = t.id AND e."purgedAt" IS NULL)`;

const n = (v) => Number(v ?? 0);

/** What a run would purge right now (no changes). */
export async function preview() {
  const years = Number(await getSetting('retentionYears', 8));
  const cutoff = cutoffFor(years);
  const [[e], [t]] = await Promise.all([
    prisma.$queryRaw`
      WITH c AS (
        SELECT r.id, ${heldSql('EXPENSE', 'r')} AS held FROM "ExpenseReport" r LEFT JOIN "Payment" p ON p."reportId" = r.id
        WHERE ${expenseBase(cutoff)})
      SELECT count(*) FILTER (WHERE NOT held) AS records, count(*) FILTER (WHERE held) AS held,
        (SELECT count(*) FROM "Attachment" a JOIN "ExpenseLine" l ON l.id = a."expenseLineId" JOIN c ON c.id = l."reportId" AND NOT c.held) AS files,
        (SELECT COALESCE(sum(a.size), 0) FROM "Attachment" a JOIN "ExpenseLine" l ON l.id = a."expenseLineId" JOIN c ON c.id = l."reportId" AND NOT c.held) AS bytes
      FROM c`,
    prisma.$queryRaw`
      WITH c AS (SELECT t.id, ${heldSql('TRAVEL', 't')} AS held FROM "TravelRequest" t WHERE ${travelBase(cutoff)})
      SELECT count(*) FILTER (WHERE NOT held) AS records, count(*) FILTER (WHERE held) AS held,
        (SELECT count(*) FROM "Attachment" a JOIN c ON c.id = a."travelRequestId" AND NOT c.held) AS files,
        (SELECT COALESCE(sum(a.size), 0) FROM "Attachment" a JOIN c ON c.id = a."travelRequestId" AND NOT c.held) AS bytes
      FROM c`,
  ]);
  const [autoPurge, lastRun, oldest] = await Promise.all([
    getSetting('retentionAutoPurge', false),
    prisma.retentionRun.findFirst({ orderBy: { startedAt: 'desc' }, include: { triggeredBy: { select: { name: true } } } }),
    prisma.expenseReport.findFirst({ where: { purgedAt: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  return {
    years,
    cutoff,
    autoPurge: autoPurge === true,
    expenses: { records: n(e.records), held: n(e.held), files: n(e.files), bytes: n(e.bytes) },
    trips: { records: n(t.records), held: n(t.held), files: n(t.files), bytes: n(t.bytes) },
    // Trips whose reports are purged in the same run become eligible during it; this is a lower bound.
    oldestRecord: oldest?.createdAt ?? null,
    lastRun,
  };
}

export const runs = () =>
  prisma.retentionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20, include: { triggeredBy: { select: { name: true } } } });

function deleteFiles(atts) {
  let bytes = 0;
  for (const a of atts) {
    fs.rmSync(path.join(uploadDir, path.basename(a.storedName)), { force: true });
    bytes += a.size;
  }
  return bytes;
}

/** Purge one batch of expense reports. Returns the purged codes and the removed files. */
async function purgeExpenseBatch(cutoff) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_LOCK})`;
    const rows = await tx.$queryRaw`
      SELECT r.id, r.code FROM "ExpenseReport" r LEFT JOIN "Payment" p ON p."reportId" = r.id
      WHERE ${expenseBase(cutoff)} AND NOT ${heldSql('EXPENSE', 'r')}
      ORDER BY r.id LIMIT ${BATCH} FOR UPDATE OF r SKIP LOCKED`;
    if (!rows.length) return null;
    const ids = rows.map((r) => r.id);
    const atts = await tx.attachment.findMany({ where: { expenseLine: { reportId: { in: ids } } }, select: { id: true, storedName: true, size: true } });
    await tx.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
    await tx.expenseLine.updateMany({ where: { reportId: { in: ids } }, data: { merchant: PURGED, description: null, flags: [] } });
    await tx.approvalStep.updateMany({ where: { expenseReportId: { in: ids } }, data: { comment: null } });
    await tx.revision.deleteMany({ where: { entityType: 'EXPENSE', entityId: { in: ids } } });
    await tx.expenseReport.updateMany({
      where: { id: { in: ids } },
      data: { title: PURGED, purpose: '', exceptionReason: null, financeNote: null, policyFlags: [], purgedAt: new Date() },
    });
    return { codes: rows.map((r) => r.code), atts };
  }, { timeout: 60_000 });
}

async function purgeTravelBatch(cutoff) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_LOCK})`;
    const rows = await tx.$queryRaw`
      SELECT t.id, t.code FROM "TravelRequest" t
      WHERE ${travelBase(cutoff)} AND NOT ${heldSql('TRAVEL', 't')}
      ORDER BY t.id LIMIT ${BATCH} FOR UPDATE OF t SKIP LOCKED`;
    if (!rows.length) return null;
    const ids = rows.map((r) => r.id);
    const atts = await tx.attachment.findMany({ where: { travelRequestId: { in: ids } }, select: { id: true, storedName: true, size: true } });
    await tx.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
    await tx.approvalStep.updateMany({ where: { travelRequestId: { in: ids } }, data: { comment: null } });
    await tx.revision.deleteMany({ where: { entityType: 'TRAVEL', entityId: { in: ids } } });
    await tx.travelRequest.updateMany({
      where: { id: { in: ids } },
      data: { title: PURGED, purpose: '', travelers: [], notes: null, exceptionReason: null, policyFlags: [], purgedAt: new Date() },
    });
    return { codes: rows.map((r) => r.code), atts };
  }, { timeout: 60_000 });
}

/** Claim the single "running" slot. Returns null if another run holds it. */
async function claimRun(trigger, user, cutoff) {
  await prisma.retentionRun.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: 'FAILED', error: 'Stopped without finishing (server restart?)', finishedAt: new Date() },
  });
  try {
    return await prisma.retentionRun.create({ data: { trigger, cutoff, triggeredById: user?.id ?? null } });
  } catch (err) {
    if (err?.code === 'P2002') return null;
    throw err;
  }
}

async function execute(run, user) {
  const totals = { expenses: 0, trips: 0, files: 0, bytes: 0 };
  try {
    for (const [kind, purge] of [['expenses', purgeExpenseBatch], ['trips', purgeTravelBatch]]) {
      for (;;) {
        const batch = await purge(run.cutoff);
        if (!batch) break;
        // Files go only after the database change has committed.
        totals.bytes += deleteFiles(batch.atts);
        totals.files += batch.atts.length;
        totals[kind] += batch.codes.length;
        await audit(user, 'retention.purged', kind === 'expenses' ? 'EXPENSE' : 'TRAVEL', null, { run: run.id, codes: batch.codes, files: batch.atts.length });
        await prisma.retentionRun.update({ where: { id: run.id }, data: totals });
      }
    }
    const done = await prisma.retentionRun.update({ where: { id: run.id }, data: { ...totals, status: 'DONE', finishedAt: new Date() } });
    await audit(user, 'retention.run_completed', 'SYSTEM', run.id, { ...totals, cutoff: run.cutoff, trigger: run.trigger });
    return done;
  } catch (err) {
    await prisma.retentionRun.update({ where: { id: run.id }, data: { ...totals, status: 'FAILED', error: String(err.message).slice(0, 500), finishedAt: new Date() } });
    await audit(user, 'retention.run_failed', 'SYSTEM', run.id, { ...totals, error: String(err.message).slice(0, 200) });
    throw err;
  }
}

/**
 * Start a run. Manual runs return at once and continue in the background (the page polls);
 * pass wait: true to await completion (scheduled job, tests).
 */
export async function start({ trigger = 'MANUAL', user = null, wait = false } = {}) {
  const p = await preview();
  const run = await claimRun(trigger, user, p.cutoff);
  if (!run) {
    if (trigger === 'SCHEDULED') return null;
    throw conflict('A retention run is already in progress');
  }
  await prisma.retentionRun.update({ where: { id: run.id }, data: { skippedOnHold: p.expenses.held + p.trips.held } });
  await audit(user, 'retention.run_started', 'SYSTEM', run.id, { trigger, cutoff: p.cutoff, years: p.years, expected: { expenses: p.expenses.records, trips: p.trips.records } });
  const job = execute(run, user);
  if (wait) return job;
  job.catch((err) => console.error('[retention] run failed', err.message));
  return run;
}

/** Nightly job entry point: only when automatic purging is switched on. */
export async function scheduledRun() {
  if ((await getSetting('retentionAutoPurge', false)) !== true) return null;
  return start({ trigger: 'SCHEDULED', wait: true });
}
