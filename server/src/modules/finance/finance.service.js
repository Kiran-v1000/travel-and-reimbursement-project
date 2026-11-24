import { prisma } from '../../db/pool.js';
import { badRequest, notFound, conflict, forbidden } from '../../shared/errors/AppError.js';
import { num, getSetting, paging, attachLineCounts, assertActiveRefs } from '../../shared/utils/index.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { recalc } from '../expenses/expenses.service.js';
import { assertChangeable } from '../compliance/compliance.holds.service.js';
import { hasViolation } from '../policy/policy.service.js';

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

/**
 * Load a report for a Finance action. Segregation of duties: nobody in Finance may review,
 * re-code or pay their own claim - another Finance colleague has to.
 */
async function loadForFinance(id, user) {
  const r = await prisma.expenseReport.findUnique({ where: { id } });
  if (!r) throw notFound('Expense report');
  if (user && r.employeeId === user.id) throw forbidden('You cannot act on your own expense report. Another Finance colleague has to.');
  return r;
}

export async function decide(user, id, { action, comment, method, scheduledFor }) {
  const r = await loadForFinance(id, user);
  if (r.status !== 'FINANCE_REVIEW') throw conflict('This report is not in Finance review');
  if (action !== 'APPROVE' && !comment?.trim()) throw badRequest('Please give a reason');
  // Approving a report that breaks policy is a policy override: it needs a recorded reason.
  const override = action === 'APPROVE' && hasViolation(r.policyFlags ?? []);
  if (override && !comment?.trim()) throw badRequest('This report breaks policy. Give a reason for approving it anyway.');
  const link = `/expenses/${id}`;
  const to = action === 'APPROVE' ? 'SCHEDULED' : action === 'REJECT' ? 'REJECTED' : 'RETURNED';
  const base = await getSetting('baseCurrency', 'INR');
  const when = scheduledFor ? new Date(scheduledFor) : new Date(Date.now() + 3 * 86400000);

  await prisma.$transaction(async (tx) => {
    // Conditional update: a second Finance user acting at the same moment gets a conflict.
    const moved = await tx.expenseReport.updateMany({ where: { id, status: 'FINANCE_REVIEW' }, data: { status: to, financeNote: comment?.trim() || null } });
    if (moved.count === 0) throw conflict('Someone else has just acted on this report. Refresh to see the latest status.');
    if (to === 'SCHEDULED') {
      await tx.payment.upsert({
        where: { reportId: id },
        create: { reportId: id, method: method || 'BANK_TRANSFER', amount: r.totalBase, currency: base, scheduledFor: when, status: 'SCHEDULED', recordedById: user.id },
        update: { method: method || 'BANK_TRANSFER', amount: r.totalBase, scheduledFor: when, status: 'SCHEDULED', recordedById: user.id, paidAt: null, reference: null },
      });
    }
    await audit(user, `finance.${{ APPROVE: 'approved', REJECT: 'rejected', RETURN: 'returned' }[action]}`, 'EXPENSE', id, {
      code: r.code, amount: num(r.totalBase), comment, status: { from: r.status, to },
      ...(to === 'SCHEDULED' ? { scheduledFor: when, method: method || 'BANK_TRANSFER' } : {}),
      ...(override ? { policyOverride: true, violations: (r.policyFlags ?? []).filter((f) => f.severity === 'violation').map((f) => f.code) } : {}),
    }, { tx });
  });

  if (to === 'SCHEDULED') {
    await notify(r.employeeId, { type: 'APPROVED', title: `Reimbursement scheduled: ${r.code}`, body: `Finance approved your claim. Payment is scheduled for ${when.toDateString()}.`, link });
  } else {
    await notify(r.employeeId, {
      type: to,
      title: action === 'REJECT' ? `${r.code} was rejected by Finance` : `Finance returned ${r.code}`,
      body: `${user.name}: ${comment}`,
      link,
    });
  }
  return { ok: true };
}

/** Correct accounting coding; every change is audited. */
export async function recode(user, id, { costCenterId, projectCode, lines = [] }) {
  const r = await loadForFinance(id, user);
  if (!['FINANCE_REVIEW', 'SCHEDULED'].includes(r.status)) throw conflict('Coding can only be corrected during Finance review');
  await assertChangeable('EXPENSE', r);
  await assertActiveRefs({ costCenterId });
  for (const l of lines) await assertActiveRefs({ categoryId: l.categoryId });
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
  const r = await loadForFinance(id, user);
  if (r.status === 'PAID') {
    const p = await prisma.payment.findUnique({ where: { reportId: id } });
    // Same payment submitted again (double click, stale screen): treat as success.
    if (p?.reference && p.reference === data.reference) return { ok: true, alreadyPaid: true };
    throw conflict(`${r.code} is already marked as paid${p?.reference ? ` (reference ${p.reference})` : ''}.`);
  }
  if (r.status !== 'SCHEDULED') throw conflict('Only scheduled reimbursements can be marked as paid');
  const base = await getSetting('baseCurrency', 'INR');
  const before = await prisma.payment.findUnique({ where: { reportId: id } });
  const approved = num(before?.amount ?? r.totalBase);
  // Paying a different amount than was approved must be explained.
  const adjusted = Math.abs(num(data.amount) - approved) >= 0.01;
  if (adjusted && !data.adjustmentReason?.trim()) {
    throw badRequest(`The amount differs from the approved ${approved.toFixed(2)}. Give a reason for the difference.`);
  }

  await prisma.$transaction(async (tx) => {
    const moved = await tx.expenseReport.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'PAID' } });
    if (moved.count === 0) throw conflict('Someone else has just recorded this payment. Refresh to see the latest status.');
    await tx.payment.upsert({
      where: { reportId: id },
      create: { reportId: id, method: data.method, amount: data.amount, currency: data.currency || base, paidAt: data.paidAt, reference: data.reference, status: 'PAID', recordedById: user.id },
      update: { method: data.method, amount: data.amount, currency: data.currency || base, paidAt: data.paidAt, reference: data.reference, status: 'PAID', recordedById: user.id },
    });
    await audit(user, 'finance.payment_recorded', 'EXPENSE', id, {
      code: r.code, reference: data.reference, paidAt: data.paidAt,
      status: { from: before?.status ?? 'SCHEDULED', to: 'PAID' },
      amount: { from: approved, to: num(data.amount) },
      method: { from: before?.method ?? null, to: data.method },
      ...(adjusted ? { adjustmentReason: data.adjustmentReason.trim() } : {}),
    }, { tx });
  });

  await notify(r.employeeId, {
    type: 'PAID', title: `Reimbursed: ${r.code}`, body: `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.currency || base }).format(data.amount)} was paid (ref ${data.reference}).`, link: `/expenses/${id}`,
  });
  return { ok: true };
}
