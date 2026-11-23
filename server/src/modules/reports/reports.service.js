import { Prisma } from '@prisma/client';
import { prisma } from '../../db/pool.js';
import { num, toCsv } from '../../shared/utils/index.js';
import { inbox } from '../approvals/approvals.service.js';

const ACTIVE_EXPENSE = ['PENDING', 'FINANCE_REVIEW', 'SCHEDULED', 'PAID'];

async function teamIds(userId) {
  // All direct and indirect reports (bounded breadth-first walk).
  const ids = [userId];
  let frontier = [userId];
  for (let depth = 0; depth < 6 && frontier.length; depth++) {
    const next = await prisma.user.findMany({ where: { managerId: { in: frontier } }, select: { id: true } });
    frontier = next.map((n) => n.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

/** null = organisation-wide; otherwise list of employee ids in scope. */
async function scopeIds(user) {
  if (['FINANCE', 'ADMIN', 'AUDITOR'].includes(user.role)) return null;
  return teamIds(user.id);
}

const empFilter = (ids, col = Prisma.sql`r."employeeId"`) => (ids ? Prisma.sql`AND ${col} IN (${Prisma.join(ids)})` : Prisma.empty);

export async function dashboard(user) {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [myTravel, myExpense, reimbursed, awaiting, upcoming, recent, pendingSteps] = await Promise.all([
    prisma.travelRequest.groupBy({ by: ['status'], where: { requesterId: user.id }, _count: true }),
    prisma.expenseReport.groupBy({ by: ['status'], where: { employeeId: user.id }, _count: true, _sum: { totalBase: true } }),
    prisma.expenseReport.aggregate({ where: { employeeId: user.id, status: 'PAID', updatedAt: { gte: yearStart } }, _sum: { totalBase: true } }),
    prisma.expenseReport.aggregate({ where: { employeeId: user.id, status: { in: ['PENDING', 'FINANCE_REVIEW', 'SCHEDULED'] } }, _sum: { totalBase: true } }),
    prisma.travelRequest.findMany({ where: { requesterId: user.id, status: 'APPROVED', endDate: { gte: now } }, orderBy: { startDate: 'asc' }, take: 3, select: { id: true, code: true, title: true, destination: true, startDate: true, endDate: true } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6 }),
    inbox(user),
  ]);

  const attention = [];
  const returnedT = await prisma.travelRequest.findMany({ where: { requesterId: user.id, status: 'RETURNED' }, select: { id: true, code: true, title: true } });
  const returnedE = await prisma.expenseReport.findMany({ where: { employeeId: user.id, status: 'RETURNED' }, select: { id: true, code: true, title: true, financeNote: true } });
  const drafts = await prisma.expenseReport.findMany({ where: { employeeId: user.id, status: 'DRAFT' }, select: { id: true, code: true, title: true, policyFlags: true } });
  returnedT.forEach((t) => attention.push({ kind: 'RETURNED', label: `${t.code} needs changes`, detail: t.title, link: `/travel/${t.id}` }));
  returnedE.forEach((e) => attention.push({ kind: 'RETURNED', label: `${e.code} needs changes`, detail: e.financeNote || e.title, link: `/expenses/${e.id}` }));
  drafts.forEach((d) => {
    const missing = (d.policyFlags ?? []).filter((f) => f.code === 'MISSING_RECEIPT').length;
    attention.push({ kind: missing ? 'RECEIPT' : 'DRAFT', label: missing ? `${missing} receipt${missing > 1 ? 's' : ''} missing in ${d.code}` : `Finish draft ${d.code}`, detail: d.title, link: `/expenses/${d.id}` });
  });

  const ids = await scopeIds(user);
  const trend = await prisma.$queryRaw`
    SELECT to_char(date_trunc('month', l."date"), 'YYYY-MM') AS month, SUM(l."baseAmount")::float AS total
    FROM "ExpenseLine" l JOIN "ExpenseReport" r ON r.id = l."reportId"
    WHERE r.status::text IN (${Prisma.join(ACTIVE_EXPENSE)}) AND l."date" >= ${new Date(now.getFullYear(), now.getMonth() - 5, 1)}
    ${user.role === 'EMPLOYEE' ? Prisma.sql`AND r."employeeId" = ${user.id}` : empFilter(ids)}
    GROUP BY 1 ORDER BY 1`;

  let finance = null;
  if (['FINANCE', 'ADMIN'].includes(user.role)) {
    const [q, sched, paidMonth] = await Promise.all([
      prisma.expenseReport.aggregate({ where: { status: 'FINANCE_REVIEW' }, _count: true, _sum: { totalBase: true } }),
      prisma.expenseReport.aggregate({ where: { status: 'SCHEDULED' }, _count: true, _sum: { totalBase: true } }),
      prisma.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, _sum: { amount: true }, _count: true }),
    ]);
    finance = {
      queueCount: q._count, queueAmount: num(q._sum.totalBase), scheduledCount: sched._count, scheduledAmount: num(sched._sum.totalBase),
      paidThisMonth: num(paidMonth._sum.amount), paidCountThisMonth: paidMonth._count,
    };
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

export async function analytics(user, q) {
  const ids = await scopeIds(user);
  const from = q.from ? new Date(q.from) : new Date(new Date().getFullYear(), 0, 1);
  const to = q.to ? new Date(q.to) : new Date();
  to.setHours(23, 59, 59, 999);
  const base = Prisma.sql`r.status::text IN (${Prisma.join(ACTIVE_EXPENSE)}) AND l."date" BETWEEN ${from} AND ${to} ${empFilter(ids)}`;

  const [byCategory, byDepartment, byMonth, byCostCenter, byCurrency] = await Promise.all([
    prisma.$queryRaw`SELECT c.name AS label, SUM(l."baseAmount")::float AS total, COUNT(*)::int AS count
      FROM "ExpenseLine" l JOIN "ExpenseReport" r ON r.id = l."reportId" JOIN "ExpenseCategory" c ON c.id = l."categoryId"
      WHERE ${base} GROUP BY c.name ORDER BY total DESC`,
    prisma.$queryRaw`SELECT COALESCE(d.name, 'Unassigned') AS label, SUM(l."baseAmount")::float AS total
      FROM "ExpenseLine" l JOIN "ExpenseReport" r ON r.id = l."reportId" JOIN "User" u ON u.id = r."employeeId" LEFT JOIN "Department" d ON d.id = u."departmentId"
      WHERE ${base} GROUP BY 1 ORDER BY total DESC`,
    prisma.$queryRaw`SELECT to_char(date_trunc('month', l."date"), 'YYYY-MM') AS label, SUM(l."baseAmount")::float AS total
      FROM "ExpenseLine" l JOIN "ExpenseReport" r ON r.id = l."reportId" WHERE ${base} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw`SELECT COALESCE(cc.code, '—') AS label, SUM(l."baseAmount")::float AS total
      FROM "ExpenseLine" l JOIN "ExpenseReport" r ON r.id = l."reportId" LEFT JOIN "CostCenter" cc ON cc.id = r."costCenterId"
      WHERE ${base} GROUP BY 1 ORDER BY total DESC`,
    prisma.$queryRaw`SELECT l.currency AS label, SUM(l.amount)::float AS original, SUM(l."baseAmount")::float AS total
      FROM "ExpenseLine" l JOIN "ExpenseReport" r ON r.id = l."reportId" WHERE ${base} GROUP BY 1 ORDER BY total DESC`,
  ]);

  const travelWhere = { startDate: { gte: from, lte: to }, status: { in: ['PENDING', 'APPROVED'] }, ...(ids ? { requesterId: { in: ids } } : {}) };
  const travelTotals = await prisma.travelRequest.aggregate({ where: travelWhere, _sum: { estTotalBase: true }, _count: true });

  // Open approvals with age buckets.
  const open = await prisma.approvalStep.findMany({
    where: { status: 'PENDING', ...(ids ? { OR: [{ travelRequest: { requesterId: { in: ids } } }, { expenseReport: { employeeId: { in: ids } } }] } : {}) },
    include: {
      approver: { select: { name: true } },
      travelRequest: { select: { code: true, estTotalBase: true, requester: { select: { name: true, department: { select: { name: true } } } } } },
      expenseReport: { select: { code: true, totalBase: true, employee: { select: { name: true, department: { select: { name: true } } } } } },
    },
  });
  const now = Date.now();
  const openApprovals = open.map((s) => {
    const e = s.travelRequest ?? s.expenseReport;
    const who = s.travelRequest?.requester ?? s.expenseReport?.employee;
    return {
      code: e.code, type: s.entityType, approver: s.approver.name, requester: who.name, department: who.department?.name ?? '—',
      amount: num(s.travelRequest?.estTotalBase ?? s.expenseReport?.totalBase), ageDays: Math.floor((now - new Date(s.activatedAt ?? s.createdAt)) / 86400000), overdue: s.dueAt ? new Date(s.dueAt) < new Date() : false,
    };
  });

  const exceptions = await prisma.expenseReport.findMany({
    where: { NOT: { policyFlags: { equals: [] } }, status: { notIn: ['DRAFT', 'WITHDRAWN'] }, ...(ids ? { employeeId: { in: ids } } : {}) },
    select: { id: true, code: true, title: true, status: true, policyFlags: true, exceptionReason: true, totalBase: true, employee: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' }, take: 50,
  });
  const returnedRejected = await prisma.expenseReport.count({ where: { status: { in: ['RETURNED', 'REJECTED'] }, ...(ids ? { employeeId: { in: ids } } : {}) } });

  const aging = await prisma.expenseReport.findMany({
    where: { status: { in: ['FINANCE_REVIEW', 'SCHEDULED'] }, ...(ids ? { employeeId: { in: ids } } : {}) },
    select: { code: true, status: true, totalBase: true, approvedAt: true, employee: { select: { name: true } } },
  });
  const buckets = { '0-7 days': 0, '8-14 days': 0, '15-30 days': 0, '30+ days': 0 };
  aging.forEach((a) => {
    const d = Math.floor((now - new Date(a.approvedAt ?? now)) / 86400000);
    const k = d <= 7 ? '0-7 days' : d <= 14 ? '8-14 days' : d <= 30 ? '15-30 days' : '30+ days';
    buckets[k] += num(a.totalBase);
  });

  const totalSpend = byCategory.reduce((a, c) => a + Number(c.total), 0);
  return {
    range: { from, to },
    kpis: { totalSpend, travelEstimate: num(travelTotals._sum.estTotalBase), trips: travelTotals._count, openApprovals: openApprovals.length, exceptions: exceptions.length, returnedRejected },
    byCategory, byDepartment, byMonth, byCostCenter, byCurrency,
    openApprovals: openApprovals.sort((a, b) => b.ageDays - a.ageDays),
    exceptions,
    reimbursementAging: Object.entries(buckets).map(([label, total]) => ({ label, total })),
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
