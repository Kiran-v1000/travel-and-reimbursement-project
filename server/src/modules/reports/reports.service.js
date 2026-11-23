import { Prisma } from '@prisma/client';
import { prisma } from '../../db/pool.js';
import { num, toCsv } from '../../shared/utils/index.js';
import { memo, semaphore } from '../../shared/utils/cache.js';
import { inbox } from '../approvals/approvals.service.js';

const ACTIVE_EXPENSE = ['PENDING', 'FINANCE_REVIEW', 'SCHEDULED', 'PAID'];
const OPEN_APPROVALS_LIMIT = 200;

/**
 * Reporting scope. Finance / Admin / Auditor see the whole organisation (null);
 * everyone else sees themselves plus their whole reporting line (indexed ancestor lookup,
 * safe for a CEO with 100k people underneath).
 */
const scopeOf = (user) => (['FINANCE', 'ADMIN', 'AUDITOR'].includes(user.role) ? null : user.id);
// Semi-join on the owner: (u.id = me OR u.ancestors @> {me}) uses the pk + GIN indexes.
const sqlScope = (me, col = Prisma.sql`r."employeeId"`) =>
  me ? Prisma.sql`AND ${col} IN (SELECT tu.id FROM "User" tu WHERE tu.id = ${me} OR tu."ancestors" @> ARRAY[${me}::text])` : Prisma.empty;

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

const rangeOf = (q) => {
  const from = q.from ? new Date(q.from) : new Date(new Date().getFullYear(), 0, 1);
  const to = q.to ? new Date(q.to) : new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

function cachedAnalytics(me, from, to) {
  const key = `${me ?? 'org'}|${from.toISOString().slice(0, 10)}|${to.toISOString().slice(0, 10)}`;
  return memo('analytics', key, ANALYTICS_TTL_MS, () => analyticsSlots(() => computeAnalytics(me, from, to)), 2000, ANALYTICS_STALE_MS);
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

async function computeAnalytics(me, from, to) {
  const owner = (col) => sqlScope(me, col);

  // One pass over the lines with GROUPING SETS instead of five separate scans.
  const grouped = await prisma.$queryRaw`
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

  const [travelTotals] = await prisma.$queryRaw`
    SELECT COALESCE(SUM(t."estTotalBase"), 0)::float AS total, COUNT(*)::int AS count FROM "TravelRequest" t
    WHERE t."startDate" BETWEEN ${from} AND ${to} AND t.status::text IN ('PENDING', 'APPROVED') ${owner(Prisma.sql`t."requesterId"`)}`;

  // Open approvals: count + oldest N ids in SQL (no OR across relations), then load details.
  const openFrom = Prisma.sql`
    FROM "ApprovalStep" s
    LEFT JOIN "TravelRequest" t ON t.id = s."travelRequestId"
    LEFT JOIN "ExpenseReport" r ON r.id = s."expenseReportId"
    WHERE s.status = 'PENDING' ${owner(Prisma.sql`COALESCE(t."requesterId", r."employeeId")`)}`;
  const [{ count: openCount }] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count ${openFrom}`;
  const openIds = (await prisma.$queryRaw`SELECT s.id ${openFrom} ORDER BY s."activatedAt" ASC NULLS LAST LIMIT ${OPEN_APPROVALS_LIMIT}`).map((r) => r.id);
  const open = openIds.length
    ? await prisma.approvalStep.findMany({
        where: { id: { in: openIds } },
        orderBy: { activatedAt: 'asc' },
        include: {
          approver: { select: { name: true } },
          travelRequest: { select: { code: true, estTotalBase: true, requester: { select: { name: true, department: { select: { name: true } } } } } },
          expenseReport: { select: { code: true, totalBase: true, employee: { select: { name: true, department: { select: { name: true } } } } } },
        },
      })
    : [];

  const exceptionFrom = Prisma.sql`FROM "ExpenseReport" r WHERE r."policyFlags" <> '[]'::jsonb AND r.status::text NOT IN ('DRAFT', 'WITHDRAWN') ${owner(Prisma.sql`r."employeeId"`)}`;
  const [{ count: exceptionsCount }] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count ${exceptionFrom}`;
  const exceptionIds = (await prisma.$queryRaw`SELECT r.id ${exceptionFrom} ORDER BY r."updatedAt" DESC LIMIT 50`).map((r) => r.id);
  const exceptions = exceptionIds.length
    ? await prisma.expenseReport.findMany({
        where: { id: { in: exceptionIds } },
        select: { id: true, code: true, title: true, status: true, policyFlags: true, exceptionReason: true, totalBase: true, employee: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
      })
    : [];

  const [{ count: returnedRejected }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM "ExpenseReport" r WHERE r.status::text IN ('RETURNED', 'REJECTED') ${owner(Prisma.sql`r."employeeId"`)}`;
  // Aggregated in the database, not in Node.
  const aging = await prisma.$queryRaw`
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
