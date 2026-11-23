import { Prisma } from '@prisma/client';
import { prisma } from '../../db/pool.js';
import { num, toCsv } from '../../shared/utils/index.js';
import { forget, memo, semaphore } from '../../shared/utils/cache.js';
import { inbox } from '../approvals/approvals.service.js';

const ACTIVE_EXPENSE = ['PENDING', 'FINANCE_REVIEW', 'SCHEDULED', 'PAID'];
const OPEN_APPROVALS_LIMIT = 200;

/**
 * Reporting scope. Finance / Admin / Auditor see the whole organisation (null);
 * everyone else sees themselves plus their whole reporting line (indexed ancestor lookup,
 * safe for a CEO with 100k people underneath).
 */
const scopeOf = (user) => (['FINANCE', 'ADMIN', 'AUDITOR'].includes(user.role) ? null : user.id);
/**
 * The team as a row set: me, plus everyone whose ancestors contain me (GIN index).
 * Written as a UNION, not "id = me OR ancestors @> {me}": with the OR, PostgreSQL scans every
 * user; with the UNION it reads only the team and drives index lookups from it.
 */
const teamSql = (me) => Prisma.sql`(SELECT ${me}::text AS id UNION ALL SELECT tu.id FROM "User" tu WHERE tu."ancestors" @> ARRAY[${me}::text])`;
const sqlScope = (me, col = Prisma.sql`r."employeeId"`) => (me ? Prisma.sql`AND ${col} IN ${teamSql(me)}` : Prisma.empty);

export async function dashboard(user) {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [myTravel, myExpense, reimbursed, awaiting, upcoming, recent, pendingSteps, returnedT, returnedE, drafts] = await Promise.all([
    prisma.travelRequest.groupBy({ by: ['status'], where: { requesterId: user.id }, _count: true }),
    prisma.expenseReport.groupBy({ by: ['status'], where: { employeeId: user.id }, _count: true, _sum: { totalBase: true } }),
    prisma.expenseReport.aggregate({ where: { employeeId: user.id, status: 'PAID', updatedAt: { gte: yearStart } }, _sum: { totalBase: true } }),
    prisma.expenseReport.aggregate({ where: { employeeId: user.id, status: { in: ['PENDING', 'FINANCE_REVIEW', 'SCHEDULED'] } }, _sum: { totalBase: true } }),
    prisma.travelRequest.findMany({ where: { requesterId: user.id, status: 'APPROVED', endDate: { gte: now } }, orderBy: { startDate: 'asc' }, take: 3, select: { id: true, code: true, title: true, destination: true, startDate: true, endDate: true } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6 }),
    inbox(user),
    prisma.travelRequest.findMany({ where: { requesterId: user.id, status: 'RETURNED' }, select: { id: true, code: true, title: true }, take: 10 }),
    prisma.expenseReport.findMany({ where: { employeeId: user.id, status: 'RETURNED' }, select: { id: true, code: true, title: true, financeNote: true }, take: 10 }),
    prisma.expenseReport.findMany({ where: { employeeId: user.id, status: 'DRAFT' }, select: { id: true, code: true, title: true, policyFlags: true }, take: 10 }),
  ]);

  const attention = [];
  returnedT.forEach((t) => attention.push({ kind: 'RETURNED', label: `${t.code} needs changes`, detail: t.title, link: `/travel/${t.id}` }));
  returnedE.forEach((e) => attention.push({ kind: 'RETURNED', label: `${e.code} needs changes`, detail: e.financeNote || e.title, link: `/expenses/${e.id}` }));
  drafts.forEach((d) => {
    const missing = (d.policyFlags ?? []).filter((f) => f.code === 'MISSING_RECEIPT').length;
    attention.push({ kind: missing ? 'RECEIPT' : 'DRAFT', label: missing ? `${missing} receipt${missing > 1 ? 's' : ''} missing in ${d.code}` : `Finish draft ${d.code}`, detail: d.title, link: `/expenses/${d.id}` });
  });

  // The spend trend is the only team-wide aggregate on the dashboard - cache it for 5 minutes.
  const me = scopeOf(user);
  const trendScope = user.role === 'EMPLOYEE' ? Prisma.sql`AND r."employeeId" = ${user.id}` : sqlScope(me);
  const trend = await memo('dashboard-trend', user.role === 'EMPLOYEE' ? `e|${user.id}` : `${me ?? 'org'}`, 300_000, () => prisma.$queryRaw`
    SELECT to_char(date_trunc('month', l."date"), 'YYYY-MM') AS month, SUM(l."baseAmount")::float AS total
    FROM "ExpenseLine" l JOIN "ExpenseReport" r ON r.id = l."reportId"
    WHERE r.status::text IN (${Prisma.join(ACTIVE_EXPENSE)}) AND l."date" >= ${new Date(now.getFullYear(), now.getMonth() - 5, 1)}
    ${trendScope}
    GROUP BY 1 ORDER BY 1`);

  let finance = null;
  if (['FINANCE', 'ADMIN'].includes(user.role)) {
    finance = await memo('dashboard-finance', 'org', 30_000, async () => {
      const [q, sched, paidMonth] = await Promise.all([
        prisma.expenseReport.aggregate({ where: { status: 'FINANCE_REVIEW' }, _count: true, _sum: { totalBase: true } }),
        prisma.expenseReport.aggregate({ where: { status: 'SCHEDULED' }, _count: true, _sum: { totalBase: true } }),
        prisma.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, _sum: { amount: true }, _count: true }),
      ]);
      return {
        queueCount: q._count, queueAmount: num(q._sum.totalBase), scheduledCount: sched._count, scheduledAmount: num(sched._sum.totalBase),
        paidThisMonth: num(paidMonth._sum.amount), paidCountThisMonth: paidMonth._count,
      };
    });
  }

  const overdue = pendingSteps.filter((s) => s.dueAt && new Date(s.dueAt) < now).length;
  return {
    travel: Object.fromEntries(myTravel.map((t) => [t.status, t._count])),
    expense: Object.fromEntries(myExpense.map((e) => [e.status, { count: e._count, amount: num(e._sum.totalBase) }])),
    reimbursedYtd: num(reimbursed._sum.totalBase),
    awaitingReimbursement: num(awaiting._sum.totalBase),
    attention,
    upcoming,
    recent,
    approvals: { pending: pendingSteps.length, overdue, items: pendingSteps.slice(0, 5) },
    trend: trend.map((t) => ({ month: t.month, total: Number(t.total) })),
    finance,
  };
}

// Analytics are heavy aggregations over the whole year: cached per scope + range for
// ANALYTICS_CACHE_SECONDS, concurrent callers share one computation, at most two cold
// computations run at once, and each runs its queries one after another (one DB connection).
const ANALYTICS_TTL_MS = Number(process.env.ANALYTICS_CACHE_SECONDS ?? 300) * 1000;
const analyticsSlots = semaphore(2);

const ANALYTICS_STALE_MS = 60 * 60 * 1000;

/**
 * Someone at the top of the reporting line (e.g. the CEO) whose team is essentially the whole
 * company shares the organisation-wide cache entry instead of computing an identical scope.
 */
async function analyticsScope(user) {
  const me = scopeOf(user);
  if (!me) return null;
  return memo('analytics-scope', me, 10 * 60 * 1000, async () => {
    const u = await prisma.user.findUnique({ where: { id: me }, select: { managerId: true } });
    if (u?.managerId) return me;
    const [team, all] = await Promise.all([prisma.user.count({ where: { ancestors: { has: me } } }), prisma.user.count()]);
    return team >= all * 0.9 ? null : me;
  });
}

/**
 * Date range of a request. Dates are calendar days (UTC), exactly as the page sends them.
 * A range that ends today or yesterday is "up to now" (open-ended): browsers and servers in
 * different time zones disagree about which day "today" is, and the nightly snapshot must be
 * found by everyone who opens the year-to-date view the next morning.
 */
const DAY = 86400_000;
export const rangeOf = (q) => {
  const now = new Date();
  const from = q.from ? new Date(`${String(q.from).slice(0, 10)}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  let to = q.to ? new Date(`${String(q.to).slice(0, 10)}T23:59:59.999Z`) : null;
  const openEnded = !to || to.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY;
  if (openEnded) to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 2 * DAY - 1); // end of tomorrow
  return { from, to, openEnded };
};

/*
 * Persisted snapshots. A finished result is stored in AnalyticsSnapshot, so it is shared by every
 * API server and survives restarts and deploys:
 *   - snapshot younger than ANALYTICS_CACHE_SECONDS  -> served as is;
 *   - older, but under a day                          -> served at once, refreshed in the background;
 *   - missing or older than a day                     -> computed now.
 * Every result carries `computedAt`, which the page shows ("Updated 3 min ago").
 * The nightly job builds the year-to-date view for the whole organisation and every large team,
 * so even the first person to open a big team's analytics in the morning gets it instantly.
 */
const SNAPSHOT_SERVE_STALE_MS = 24 * 3600_000;
const refreshing = new Set();
// An open-ended range (ending today or later) is keyed 'now', so it is the same entry all day, in every time zone.
export const keyOf = (me, from, to) => `${me ?? 'org'}|${from.toISOString().slice(0, 10)}|${to.getTime() > Date.now() ? 'now' : to.toISOString().slice(0, 10)}`;

async function computeAndStore(me, from, to, key) {
  const started = Date.now();
  const result = await analyticsSlots(() => computeAnalytics(me, from, to));
  const computedAt = new Date();
  // Store exactly what the API returns (JSON), so a snapshot and a fresh result are identical.
  const data = JSON.parse(JSON.stringify({ ...result, computedAt }));
  const computeMs = Date.now() - started;
  await prisma.analyticsSnapshot.upsert({ where: { key }, create: { key, data, computedAt, computeMs }, update: { data, computedAt, computeMs } });
  return data;
}

function refreshInBackground(me, from, to, key) {
  if (refreshing.has(key)) return;
  refreshing.add(key);
  computeAndStore(me, from, to, key)
    .then(() => forget('analytics', key))
    .catch((err) => console.error('[analytics] background refresh failed', key, err.message))
    .finally(() => refreshing.delete(key));
}

async function loadAnalytics(me, from, to, key) {
  const snap = await prisma.analyticsSnapshot.findUnique({ where: { key }, select: { data: true, computedAt: true } });
  const age = snap ? Date.now() - snap.computedAt.getTime() : Infinity;
  if (age < ANALYTICS_TTL_MS) return snap.data;
  if (age < SNAPSHOT_SERVE_STALE_MS) {
    refreshInBackground(me, from, to, key);
    // Tell the page a newer result is on its way, so it checks back in a few seconds.
    return { ...snap.data, refreshing: true };
  }
  return computeAndStore(me, from, to, key);
}

function cachedAnalytics(me, from, to) {
  const key = keyOf(me, from, to);
  return memo('analytics', key, ANALYTICS_TTL_MS, () => loadAnalytics(me, from, to, key), 2000, ANALYTICS_STALE_MS);
}

export async function analytics(user, q) {
  const { from, to } = rangeOf(q);
  return cachedAnalytics(await analyticsScope(user), from, to);
}

/** Keep the organisation-wide year-to-date analytics warm (called by the jobs scheduler). */
export function warmOrgAnalytics() {
  const { from, to } = rangeOf({});
  return cachedAnalytics(null, from, to);
}

/** Smallest team whose year-to-date analytics is built every night. */
const PRECOMPUTE_MIN_TEAM = Number(process.env.ANALYTICS_PRECOMPUTE_MIN_TEAM ?? 200);

/**
 * Nightly: rebuild the year-to-date snapshot for the organisation and for every team of at least
 * PRECOMPUTE_MIN_TEAM people (one at a time), then drop snapshots nobody has opened for 3 days.
 * Only one server does it per night (a lease row in Counter).
 */
export async function precomputeAnalytics({ minTeam = PRECOMPUTE_MIN_TEAM } = {}) {
  const nowMin = Math.floor(Date.now() / 60_000);
  const claimed = await prisma.$executeRaw`
    INSERT INTO "Counter" ("key", "value") VALUES ('analytics-precompute', ${nowMin})
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value" WHERE "Counter"."value" < ${nowMin - 60}`;
  if (!claimed) return null;

  const started = Date.now();
  const { from, to } = rangeOf({});
  const [{ all }] = await prisma.$queryRaw`SELECT count(*)::int AS "all" FROM "User"`;
  // One pass over the paths gives every manager's team size.
  const teams = await prisma.$queryRaw`
    SELECT a AS id, count(*)::int AS team FROM "User", unnest("ancestors") AS a
    GROUP BY a HAVING count(*) >= ${minTeam} ORDER BY count(*) DESC`;
  // Someone whose team is ~the whole company shares the organisation view (see analyticsScope).
  const scopes = [null, ...teams.filter((t) => t.team < all * 0.9).map((t) => t.id)];
  let built = 0;
  for (const me of scopes) {
    const key = keyOf(me, from, to);
    try {
      await computeAndStore(me, from, to, key);
      forget('analytics', key);
      built++;
    } catch (err) {
      console.error('[analytics] precompute failed', key, err.message);
    }
  }
  const { count: removed } = await prisma.analyticsSnapshot.deleteMany({ where: { computedAt: { lt: new Date(Date.now() - 3 * 86400_000) } } });
  return { built, scopes: scopes.length, removed, ms: Date.now() - started };
}

/**
 * Runs in one transaction (one connection) with custom plans forced: these statements are
 * prepared, and after a few runs PostgreSQL may switch to a generic plan that ignores which team
 * is asked for - fine for a 10-person team, a full scan (and a timeout) for a 10k one.
 */
function computeAnalytics(me, from, to) {
  return prisma.$transaction(async (db) => {
    await db.$executeRaw`SET LOCAL plan_cache_mode = force_custom_plan`;
    return computeAnalyticsIn(db, me, from, to);
  }, { timeout: 120_000, maxWait: 30_000 });
}

async function computeAnalyticsIn(db, me, from, to) {
  const owner = (col) => sqlScope(me, col);

  // One pass over the lines with GROUPING SETS instead of five separate scans.
  const grouped = await db.$queryRaw`
    WITH scoped AS (
      SELECT l."baseAmount", l.amount, l.currency, to_char(date_trunc('month', l."date"), 'YYYY-MM') AS month,
             c.name AS category, COALESCE(d.name, 'Unassigned') AS department, COALESCE(cc.code, '—') AS cost_center
      FROM "ExpenseLine" l
      JOIN "ExpenseReport" r ON r.id = l."reportId"
      JOIN "User" u ON u.id = r."employeeId"
      JOIN "ExpenseCategory" c ON c.id = l."categoryId"
      LEFT JOIN "Department" d ON d.id = u."departmentId"
      LEFT JOIN "CostCenter" cc ON cc.id = r."costCenterId"
      WHERE r.status::text IN (${Prisma.join(ACTIVE_EXPENSE)}) AND l."date" BETWEEN ${from} AND ${to} ${owner(Prisma.sql`r."employeeId"`)}
    )
    SELECT CASE WHEN GROUPING(category) = 0 THEN 'category' WHEN GROUPING(department) = 0 THEN 'department'
                WHEN GROUPING(month) = 0 THEN 'month' WHEN GROUPING(cost_center) = 0 THEN 'costCenter' ELSE 'currency' END AS kind,
           COALESCE(category, department, month, cost_center, currency) AS label,
           SUM("baseAmount")::float AS total, SUM(amount)::float AS original, COUNT(*)::int AS count
    FROM scoped
    GROUP BY GROUPING SETS ((category), (department), (month), (cost_center), (currency))`;
  const pick = (kind, sort = (a, b) => b.total - a.total, limit = 25) =>
    grouped.filter((g) => g.kind === kind).sort(sort).slice(0, limit).map(({ kind: _k, ...rest }) => rest);
  const byCategory = pick('category', undefined, 50);
  const byDepartment = pick('department');
  const byMonth = pick('month', (a, b) => a.label.localeCompare(b.label), 24);
  const byCostCenter = pick('costCenter');
  const byCurrency = pick('currency');

  const [travelTotals] = await db.$queryRaw`
    SELECT COALESCE(SUM(t."estTotalBase"), 0)::float AS total, COUNT(*)::int AS count FROM "TravelRequest" t
    WHERE t."startDate" BETWEEN ${from} AND ${to} AND t.status::text IN ('PENDING', 'APPROVED') ${owner(Prisma.sql`t."requesterId"`)}`;

  // Open approvals: count + oldest N ids in SQL, then load details. Expense and travel steps are
  // scoped separately - a COALESCE over both owners cannot use an index.
  const openFrom = me
    ? Prisma.sql`FROM (
        SELECT s.id, s."activatedAt" FROM "ApprovalStep" s JOIN "ExpenseReport" r ON r.id = s."expenseReportId"
        WHERE s.status = 'PENDING' AND r."employeeId" IN ${teamSql(me)}
        UNION ALL
        SELECT s.id, s."activatedAt" FROM "ApprovalStep" s JOIN "TravelRequest" t ON t.id = s."travelRequestId"
        WHERE s.status = 'PENDING' AND t."requesterId" IN ${teamSql(me)}) s`
    : Prisma.sql`FROM "ApprovalStep" s WHERE s.status = 'PENDING'`;
  const [{ count: openCount }] = await db.$queryRaw`SELECT COUNT(*)::int AS count ${openFrom}`;
  const openIds = (await db.$queryRaw`SELECT s.id ${openFrom} ORDER BY s."activatedAt" ASC NULLS LAST, s.id LIMIT ${OPEN_APPROVALS_LIMIT}`).map((r) => r.id);
  const open = openIds.length
    ? await db.approvalStep.findMany({
        where: { id: { in: openIds } },
        orderBy: [{ activatedAt: 'asc' }, { id: 'asc' }],
        include: {
          approver: { select: { name: true } },
          travelRequest: { select: { code: true, estTotalBase: true, requester: { select: { name: true, department: { select: { name: true } } } } } },
          expenseReport: { select: { code: true, totalBase: true, employee: { select: { name: true, department: { select: { name: true } } } } } },
        },
      })
    : [];

  const exceptionFrom = Prisma.sql`FROM "ExpenseReport" r WHERE r."policyFlags" <> '[]'::jsonb AND r.status::text NOT IN ('DRAFT', 'WITHDRAWN') ${owner(Prisma.sql`r."employeeId"`)}`;
  const [{ count: exceptionsCount }] = await db.$queryRaw`SELECT COUNT(*)::int AS count ${exceptionFrom}`;
  const exceptionIds = (await db.$queryRaw`SELECT r.id ${exceptionFrom} ORDER BY r."updatedAt" DESC, r.id DESC LIMIT 50`).map((r) => r.id);
  const exceptions = exceptionIds.length
    ? await db.expenseReport.findMany({
        where: { id: { in: exceptionIds } },
        select: { id: true, code: true, title: true, status: true, policyFlags: true, exceptionReason: true, totalBase: true, employee: { select: { name: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      })
    : [];

  const [{ count: returnedRejected }] = await db.$queryRaw`
    SELECT COUNT(*)::int AS count FROM "ExpenseReport" r WHERE r.status::text IN ('RETURNED', 'REJECTED') ${owner(Prisma.sql`r."employeeId"`)}`;
  // Aggregated in the database, not in Node.
  const aging = await db.$queryRaw`
    SELECT CASE WHEN age <= 7 THEN '0-7 days' WHEN age <= 14 THEN '8-14 days' WHEN age <= 30 THEN '15-30 days' ELSE '30+ days' END AS label,
           SUM(total)::float AS total
    FROM (SELECT EXTRACT(DAY FROM now() - COALESCE(r."approvedAt", now()))::int AS age, r."totalBase" AS total
          FROM "ExpenseReport" r WHERE r.status::text IN ('FINANCE_REVIEW', 'SCHEDULED') ${owner(Prisma.sql`r."employeeId"`)}) x
    GROUP BY 1`;

  const now = Date.now();
  const openApprovals = open.map((s) => {
    const e = s.travelRequest ?? s.expenseReport;
    const who = s.travelRequest?.requester ?? s.expenseReport?.employee;
    return {
      code: e.code, type: s.entityType, approver: s.approver.name, requester: who.name, department: who.department?.name ?? '—',
      amount: num(s.travelRequest?.estTotalBase ?? s.expenseReport?.totalBase), ageDays: Math.floor((now - new Date(s.activatedAt ?? s.createdAt)) / 86400000), overdue: s.dueAt ? new Date(s.dueAt) < new Date() : false,
    };
  });
  const buckets = ['0-7 days', '8-14 days', '15-30 days', '30+ days'].map((label) => ({ label, total: Number(aging.find((a) => a.label === label)?.total ?? 0) }));

  const totalSpend = byCategory.reduce((a, c) => a + Number(c.total), 0);
  return {
    range: { from, to },
    kpis: { totalSpend, travelEstimate: travelTotals.total, trips: travelTotals.count, openApprovals: openCount, exceptions: exceptionsCount, returnedRejected },
    byCategory, byDepartment, byMonth, byCostCenter, byCurrency,
    openApprovals,
    openApprovalsTruncated: openCount > openApprovals.length,
    exceptions,
    reimbursementAging: buckets,
  };
}

export async function exportAnalytics(user, q, kind) {
  const a = await analytics(user, q);
  if (kind === 'approvals') {
    return toCsv(a.openApprovals, [
      { label: 'Code', value: 'code' }, { label: 'Type', value: 'type' }, { label: 'Requester', value: 'requester' }, { label: 'Department', value: 'department' },
      { label: 'Approver', value: 'approver' }, { label: 'Amount', value: 'amount' }, { label: 'Age (days)', value: 'ageDays' }, { label: 'Overdue', value: 'overdue' },
    ]);
  }
  if (kind === 'exceptions') {
    return toCsv(a.exceptions, [
      { label: 'Code', value: 'code' }, { label: 'Employee', value: (r) => r.employee.name }, { label: 'Status', value: 'status' }, { label: 'Total', value: (r) => num(r.totalBase) },
      { label: 'Flags', value: (r) => r.policyFlags.map((f) => f.code).join(' | ') }, { label: 'Justification', value: 'exceptionReason' },
    ]);
  }
  return toCsv(a.byCategory, [{ label: 'Category', value: 'label' }, { label: 'Lines', value: 'count' }, { label: 'Total (base)', value: 'total' }]);
}
