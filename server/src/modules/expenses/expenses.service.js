import { prisma } from '../../db/pool.js';
import { badRequest, forbidden, notFound, conflict, AppError } from '../../shared/errors/AppError.js';
import { nextCode, toBase, round2, getSetting, num, paging, toCsv } from '../../shared/utils/index.js';
import { assertCanView, visibilityWhere } from '../../shared/utils/access.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { checkExpense, hasViolation } from '../policy/policy.service.js';
import { selectRule, createRoute } from '../approvals/approvals.engine.js';
import { previewRoute, returningLevel } from '../approvals/approvals.preview.js';
import { timeline } from '../approvals/approvals.service.js';

const EDITABLE = ['DRAFT', 'RETURNED'];

const listSelect = {
  id: true, code: true, title: true, totalBase: true, currency: true, status: true, submittedAt: true, updatedAt: true, policyFlags: true,
  employee: { select: { id: true, name: true, title: true } },
  travelRequest: { select: { id: true, code: true, destination: true } },
  costCenter: { select: { code: true } },
  payment: { select: { status: true, paidAt: true, scheduledFor: true } },
  steps: { where: { status: 'PENDING' }, select: { label: true, approver: { select: { name: true } } } },
  _count: { select: { lines: true } },
};

export async function list(user, q) {
  const { skip, take, page, pageSize } = paging(q);
  const where = { AND: [] };
  if (q.scope === 'mine' || !q.scope) where.AND.push({ employeeId: user.id });
  else where.AND.push(await visibilityWhere(user, 'employeeId', 'EXPENSE'));
  const base = [...where.AND];
  if (q.status) where.AND.push({ status: { in: q.status.split(',') } });
  if (q.search) {
    const s = { OR: [
      { code: { contains: q.search, mode: 'insensitive' } },
      { title: { contains: q.search, mode: 'insensitive' } },
      { employee: { name: { contains: q.search, mode: 'insensitive' } } },
    ] };
    where.AND.push(s);
    base.push(s);
  }
  const [items, total, counts] = await Promise.all([
    prisma.expenseReport.findMany({ where, select: listSelect, orderBy: { updatedAt: 'desc' }, skip, take }),
    prisma.expenseReport.count({ where }),
    prisma.expenseReport.groupBy({ by: ['status'], where: { AND: base }, _count: true }),
  ]);
  return { items, total, page, pageSize, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
}

const fullInclude = {
  employee: { select: { id: true, name: true, email: true, title: true, department: { select: { name: true } }, manager: { select: { name: true } } } },
  costCenter: { select: { id: true, code: true, name: true } },
  travelRequest: { select: { id: true, code: true, title: true, startDate: true, endDate: true, estTotalBase: true, destination: true } },
  lines: {
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: { category: true, attachments: { select: { id: true, originalName: true, mimeType: true, size: true } } },
  },
  payment: { include: { recordedBy: { select: { name: true } } } },
};

export async function get(user, id) {
  const r = await prisma.expenseReport.findUnique({ where: { id }, include: fullInclude });
  if (!r) throw notFound('Expense report');
  const steps = await timeline({ expenseReportId: id });
  await assertCanView(user, { ownerId: r.employeeId, entityType: 'EXPENSE', steps });
  const [revisions, activity] = await Promise.all([
    prisma.revision.findMany({ where: { entityType: 'EXPENSE', entityId: id }, orderBy: { version: 'desc' } }),
    prisma.auditLog.findMany({ where: { entityType: 'EXPENSE', entityId: id }, orderBy: { seq: 'asc' } }),
  ]);
  return { ...r, steps, revisions, activity };
}

async function assertLinkable(user, travelRequestId) {
  if (!travelRequestId) return;
  const t = await prisma.travelRequest.findUnique({ where: { id: travelRequestId } });
  if (!t || t.requesterId !== user.id) throw badRequest('You can only link your own trips');
  if (t.status !== 'APPROVED') throw badRequest('Only approved trips can be linked to an expense report');
}

export async function create(user, data) {
  await assertLinkable(user, data.travelRequestId);
  const base = await getSetting('baseCurrency', 'INR');
  const r = await prisma.$transaction(async (tx) => {
    const code = await nextCode('EX', tx);
    return tx.expenseReport.create({ data: { ...data, travelRequestId: data.travelRequestId || null, code, employeeId: user.id, currency: base } });
  });
  await audit(user, 'expense.created', 'EXPENSE', r.id, { code: r.code });
  return r;
}

async function loadOwned(user, id) {
  const r = await prisma.expenseReport.findUnique({ where: { id } });
  if (!r) throw notFound('Expense report');
  if (r.employeeId !== user.id) throw forbidden('Only the claimant can change this report');
  return r;
}

async function loadEditable(user, id) {
  const r = await loadOwned(user, id);
  if (!EDITABLE.includes(r.status)) throw conflict('Only draft or returned reports can be edited');
  return r;
}

/** Recalculate totals and policy flags (report + per line). */
export async function recalc(id) {
  const r = await prisma.expenseReport.findUnique({
    where: { id },
    include: { lines: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { attachments: true } } } }, travelRequest: true },
  });
  const flags = await checkExpense(r);
  const total = round2(r.lines.reduce((a, l) => a + num(l.baseAmount), 0));
  await prisma.$transaction([
    prisma.expenseReport.update({ where: { id }, data: { totalBase: total, policyFlags: flags } }),
    ...r.lines.map((l) => prisma.expenseLine.update({ where: { id: l.id }, data: { flags: flags.filter((f) => f.lineId === l.id) } })),
  ]);
  return { flags, total };
}

export async function update(user, id, data) {
  const r = await loadEditable(user, id);
  await assertLinkable(user, data.travelRequestId);
  await prisma.expenseReport.update({ where: { id }, data: { ...data, travelRequestId: data.travelRequestId || null } });
  await recalc(id);
  await audit(user, 'expense.updated', 'EXPENSE', id, { code: r.code });
  return get(user, id);
}

async function lineData(data) {
  const fx = await toBase(data.amount, data.currency);
  return { ...data, fxRate: fx.rate, fxDate: fx.date, baseAmount: fx.base };
}

export async function addLine(user, id, data) {
  const r = await loadEditable(user, id);
  const line = await prisma.expenseLine.create({ data: { ...(await lineData(data)), reportId: id } });
  await recalc(id);
  await audit(user, 'expense.line_added', 'EXPENSE', id, { code: r.code, lineId: line.id, merchant: line.merchant, amount: num(line.amount), currency: line.currency });
  return line;
}

export async function updateLine(user, id, lineId, data) {
  const r = await loadEditable(user, id);
  const existing = await prisma.expenseLine.findFirst({ where: { id: lineId, reportId: id } });
  if (!existing) throw notFound('Expense line');
  const line = await prisma.expenseLine.update({ where: { id: lineId }, data: await lineData(data) });
  await recalc(id);
  await audit(user, 'expense.line_updated', 'EXPENSE', id, { code: r.code, lineId, before: { amount: num(existing.amount), merchant: existing.merchant }, after: { amount: num(line.amount), merchant: line.merchant } });
  return line;
}

export async function deleteLine(user, id, lineId) {
  const r = await loadEditable(user, id);
  const existing = await prisma.expenseLine.findFirst({ where: { id: lineId, reportId: id } });
  if (!existing) throw notFound('Expense line');
  await prisma.expenseLine.delete({ where: { id: lineId } });
  await recalc(id);
  await audit(user, 'expense.line_deleted', 'EXPENSE', id, { code: r.code, merchant: existing.merchant, amount: num(existing.amount) });
  return { ok: true };
}

export async function policy(user, id) {
  const r = await loadOwned(user, id);
  const { flags, total } = await recalc(id);
  const costCenter = r.costCenterId ? await prisma.costCenter.findUnique({ where: { id: r.costCenterId } }) : null;
  const route = await previewRoute(user.id, { entityType: 'EXPENSE', amount: total, costCenterCode: costCenter?.code, hasException: hasViolation(flags) });
  return { flags, total, route };
}

export async function submit(user, id, { exceptionReason }) {
  const r = await loadEditable(user, id);
  const { flags, total } = await recalc(id);
  const lineCount = await prisma.expenseLine.count({ where: { reportId: id } });
  if (!lineCount) throw badRequest('Add at least one expense before submitting');
  const exception = hasViolation(flags);
  if (exception && !exceptionReason?.trim() && !r.exceptionReason) {
    throw new AppError(422, 'This report has policy exceptions. Please explain them before submitting.', 'EXCEPTION_REASON_REQUIRED', { flags });
  }
  const requester = await prisma.user.findUnique({ where: { id: user.id } });
  const costCenter = r.costCenterId ? await prisma.costCenter.findUnique({ where: { id: r.costCenterId } }) : null;
  const rule = await selectRule({ entityType: 'EXPENSE', amount: total, requester, costCenterCode: costCenter?.code, hasException: exception });

  let skipLevelsBelow = null;
  if (r.status === 'RETURNED' && (await getSetting('resubmitRule', 'RESTART')) === 'RETURNING_LEVEL') {
    skipLevelsBelow = await returningLevel({ expenseReportId: id }, r.round);
  }
  // Returned by Finance after manager approval: go straight back to Finance.
  const returnedByFinance = r.status === 'RETURNED' && r.approvedAt && !(await prisma.approvalStep.findFirst({ where: { expenseReportId: id, round: r.round, status: 'RETURNED' } }));

  const full = await prisma.expenseReport.findUnique({ where: { id }, include: { lines: true } });
  const round = r.round + 1;
  const version = r.status === 'RETURNED' ? r.version + 1 : r.version;
  const result = await prisma.$transaction(async (tx) => {
    await tx.revision.create({ data: { entityType: 'EXPENSE', entityId: id, version, snapshot: JSON.parse(JSON.stringify(full)), createdById: user.id } });
    if (returnedByFinance) {
      const updated = await tx.expenseReport.update({ where: { id }, data: { status: 'FINANCE_REVIEW', round, version, submittedAt: new Date(), exceptionReason: exceptionReason?.trim() || r.exceptionReason } });
      return { updated, route: { steps: [], firstActive: null }, toFinance: true };
    }
    const route = await createRoute(tx, { entityType: 'EXPENSE', entityId: id, requester, rule, round, skipLevelsBelow });
    const final = route.firstActive == null;
    const updated = await tx.expenseReport.update({
      where: { id },
      data: {
        status: final ? 'FINANCE_REVIEW' : 'PENDING', round, version, submittedAt: new Date(), approvedAt: final ? new Date() : null,
        exceptionReason: exceptionReason?.trim() || r.exceptionReason, ruleId: rule.id, ruleName: rule.name, ruleVersion: rule.version,
      },
    });
    return { updated, route, toFinance: final };
  });

  await audit(user, r.status === 'RETURNED' ? 'expense.resubmitted' : 'expense.submitted', 'EXPENSE', id, {
    code: r.code, amount: total, rule: rule.name, ruleVersion: rule.version, policyFlags: flags.map((f) => f.code), round,
  });
  const pending = result.route.steps.filter((s) => s.status === 'PENDING');
  await notify(pending.map((s) => s.approverId), {
    type: 'ACTION_REQUIRED', title: `Expense approval needed: ${r.code}`, body: `${requester.name} submitted "${r.title}" for review.`, link: `/expenses/${id}`,
  });
  if (result.toFinance) {
    const finance = await prisma.user.findMany({ where: { role: 'FINANCE', active: true }, select: { id: true } });
    await notify(finance.map((f) => f.id), { type: 'ACTION_REQUIRED', title: `Report in Finance queue: ${r.code}`, body: `${r.title} is ready for Finance review.`, link: '/finance' });
  }
  return result.updated;
}

export async function withdraw(user, id) {
  const r = await loadOwned(user, id);
  if (!['DRAFT', 'PENDING', 'RETURNED'].includes(r.status)) throw conflict('Reports already with Finance or decided cannot be withdrawn');
  await prisma.$transaction([
    prisma.approvalStep.updateMany({ where: { expenseReportId: id, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED', resolution: 'Withdrawn by claimant' } }),
    prisma.expenseReport.update({ where: { id }, data: { status: 'WITHDRAWN' } }),
  ]);
  await audit(user, 'expense.withdrawn', 'EXPENSE', id, { code: r.code });
  return { ok: true };
}

export async function remove(user, id) {
  const r = await loadOwned(user, id);
  if (r.status !== 'DRAFT') throw badRequest('Only drafts can be deleted');
  await prisma.expenseReport.delete({ where: { id } });
  await audit(user, 'expense.draft_deleted', 'EXPENSE', id, { code: r.code });
  return { ok: true };
}

export async function exportCsv(user, q) {
  const data = await list(user, { ...q, pageSize: 100, page: 1 });
  return toCsv(data.items, [
    { label: 'Code', value: 'code' },
    { label: 'Title', value: 'title' },
    { label: 'Employee', value: (r) => r.employee.name },
    { label: 'Trip', value: (r) => r.travelRequest?.code },
    { label: 'Lines', value: (r) => r._count.lines },
    { label: 'Total (base)', value: (r) => num(r.totalBase) },
    { label: 'Cost center', value: (r) => r.costCenter?.code },
    { label: 'Status', value: 'status' },
    { label: 'Submitted', value: 'submittedAt' },
  ]);
}
