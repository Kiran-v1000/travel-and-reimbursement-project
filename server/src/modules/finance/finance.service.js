import { prisma } from '../../db/pool.js';
import { badRequest, notFound, conflict } from '../../shared/errors/AppError.js';
import { num, getSetting, paging, attachLineCounts } from '../../shared/utils/index.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { recalc } from '../expenses/expenses.service.js';

const queueSelect = {
  id: true, code: true, title: true, totalBase: true, status: true, approvedAt: true, submittedAt: true, policyFlags: true, exceptionReason: true,
  employee: { select: { id: true, name: true, title: true, department: { select: { name: true } } } },
  costCenter: { select: { code: true, name: true } },
  travelRequest: { select: { code: true } },
  payment: true,
};

/** Paginated (oldest first) - the queue can hold thousands of reports at month end. */
export async function queue(q) {
  const { skip, take, page, pageSize } = paging(q);
  const where = { status: 'FINANCE_REVIEW' };
  if (q.flagged === 'true') where.NOT = { policyFlags: { equals: [] } };
  const [items, total, sum] = await Promise.all([
    prisma.expenseReport.findMany({ where, select: queueSelect, orderBy: { approvedAt: 'asc' }, skip, take }),
    prisma.expenseReport.count({ where }),
    prisma.expenseReport.aggregate({ where, _sum: { totalBase: true } }),
  ]);
  await attachLineCounts(items);
  return { items, total, page, pageSize, amount: num(sum._sum.totalBase) };
}

export async function payments(q) {
  const { skip, take, page, pageSize } = paging(q);
  const allowed = ['SCHEDULED', 'PAID'];
  const where = { status: { in: (q.status || 'SCHEDULED,PAID').split(',').filter((s) => allowed.includes(s)) } };
  const [items, total, sum] = await Promise.all([
    prisma.expenseReport.findMany({ where, select: queueSelect, orderBy: { updatedAt: 'desc' }, skip, take }),
    prisma.expenseReport.count({ where }),
    prisma.expenseReport.aggregate({ where, _sum: { totalBase: true } }),
  ]);
  await attachLineCounts(items);
  return { items, total, page, pageSize, amount: num(sum._sum.totalBase) };
}

async function loadForFinance(id) {
  const r = await prisma.expenseReport.findUnique({ where: { id } });
  if (!r) throw notFound('Expense report');
  return r;
}

export async function decide(user, id, { action, comment, method, scheduledFor }) {
  const r = await loadForFinance(id);
  if (r.status !== 'FINANCE_REVIEW') throw conflict('This report is not in Finance review');
  if (r.employeeId === user.id) throw badRequest('You cannot review your own expense report');
  if (action !== 'APPROVE' && !comment?.trim()) throw badRequest('Please give a reason');
  const link = `/expenses/${id}`;

  if (action === 'APPROVE') {
    const base = await getSetting('baseCurrency', 'INR');
    const when = scheduledFor ? new Date(scheduledFor) : new Date(Date.now() + 3 * 86400000);
    await prisma.$transaction([
      prisma.expenseReport.update({ where: { id }, data: { status: 'SCHEDULED', financeNote: comment?.trim() || null } }),
      prisma.payment.upsert({
        where: { reportId: id },
        create: { reportId: id, method: method || 'BANK_TRANSFER', amount: r.totalBase, currency: base, scheduledFor: when, status: 'SCHEDULED', recordedById: user.id },
        update: { method: method || 'BANK_TRANSFER', amount: r.totalBase, scheduledFor: when, status: 'SCHEDULED', recordedById: user.id, paidAt: null, reference: null },
      }),
    ]);
    await audit(user, 'finance.approved', 'EXPENSE', id, { code: r.code, amount: num(r.totalBase), scheduledFor: when, comment });
    await notify(r.employeeId, { type: 'APPROVED', title: `Reimbursement scheduled: ${r.code}`, body: `Finance approved your claim. Payment is scheduled for ${when.toDateString()}.`, link });
    return { ok: true };
  }
  const status = action === 'REJECT' ? 'REJECTED' : 'RETURNED';
  await prisma.expenseReport.update({ where: { id }, data: { status, financeNote: comment.trim() } });
  await audit(user, action === 'REJECT' ? 'finance.rejected' : 'finance.returned', 'EXPENSE', id, { code: r.code, comment });
  await notify(r.employeeId, {
    type: status,
    title: action === 'REJECT' ? `${r.code} was rejected by Finance` : `Finance returned ${r.code}`,
    body: `${user.name}: ${comment}`,
    link,
  });
  return { ok: true };
}

/** Correct accounting coding; every change is audited. */
export async function recode(user, id, { costCenterId, projectCode, lines = [] }) {
  const r = await loadForFinance(id);
  if (!['FINANCE_REVIEW', 'SCHEDULED'].includes(r.status)) throw conflict('Coding can only be corrected during Finance review');
  const changes = [];
  if (costCenterId && costCenterId !== r.costCenterId) changes.push({ field: 'costCenterId', from: r.costCenterId, to: costCenterId });
  if (projectCode !== undefined && projectCode !== r.projectCode) changes.push({ field: 'projectCode', from: r.projectCode, to: projectCode });
  await prisma.expenseReport.update({ where: { id }, data: { ...(costCenterId ? { costCenterId } : {}), ...(projectCode !== undefined ? { projectCode } : {}) } });
  for (const l of lines) {
    const existing = await prisma.expenseLine.findFirst({ where: { id: l.id, reportId: id } });
    if (existing && l.categoryId && l.categoryId !== existing.categoryId) {
      await prisma.expenseLine.update({ where: { id: l.id }, data: { categoryId: l.categoryId } });
      changes.push({ field: `line:${l.id}:category`, from: existing.categoryId, to: l.categoryId });
    }
  }
  if (changes.length) {
    await recalc(id);
    await audit(user, 'finance.recoded', 'EXPENSE', id, { code: r.code, changes });
  }
  return { ok: true, changes: changes.length };
}

export async function recordPayment(user, id, data) {
  const r = await loadForFinance(id);
  if (r.status !== 'SCHEDULED') throw conflict('Only scheduled reimbursements can be marked as paid');
  const base = await getSetting('baseCurrency', 'INR');
  await prisma.$transaction([
    prisma.payment.upsert({
      where: { reportId: id },
      create: { reportId: id, method: data.method, amount: data.amount, currency: data.currency || base, paidAt: data.paidAt, reference: data.reference, status: 'PAID', recordedById: user.id },
      update: { method: data.method, amount: data.amount, currency: data.currency || base, paidAt: data.paidAt, reference: data.reference, status: 'PAID', recordedById: user.id },
    }),
    prisma.expenseReport.update({ where: { id }, data: { status: 'PAID' } }),
  ]);
  await audit(user, 'finance.payment_recorded', 'EXPENSE', id, { code: r.code, amount: data.amount, method: data.method, reference: data.reference, paidAt: data.paidAt });
  await notify(r.employeeId, {
    type: 'PAID', title: `Reimbursed: ${r.code}`, body: `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.currency || base }).format(data.amount)} was paid (ref ${data.reference}).`, link: `/expenses/${id}`,
  });
  return { ok: true };
}
