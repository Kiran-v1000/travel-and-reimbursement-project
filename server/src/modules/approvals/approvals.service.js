import { prisma } from '../../db/pool.js';
import { badRequest, forbidden, notFound, conflict } from '../../shared/errors/AppError.js';
import { getSettings, attachLineCounts } from '../../shared/utils/index.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { activateNextLevel, delegatorsFor } from './approvals.engine.js';

const stepInclude = {
  approver: { select: { id: true, name: true, email: true, title: true } },
  actedBy: { select: { id: true, name: true } },
  travelRequest: {
    select: {
      id: true, code: true, title: true, destination: true, origin: true, startDate: true, endDate: true, estTotalBase: true,
      status: true, round: true, policyFlags: true, travelType: true, submittedAt: true,
      requester: { select: { id: true, name: true, title: true, department: { select: { name: true } } } },
    },
  },
  expenseReport: {
    select: {
      id: true, code: true, title: true, totalBase: true, status: true, round: true, policyFlags: true, submittedAt: true,
      employee: { select: { id: true, name: true, title: true, department: { select: { name: true } } } },
    },
  },
};

export function shapeStep(s) {
  const t = s.travelRequest;
  const e = s.expenseReport;
  const entity = t
    ? { type: 'TRAVEL', id: t.id, code: t.code, title: t.title, amount: Number(t.estTotalBase), status: t.status, round: t.round, flags: t.policyFlags, requester: t.requester, submittedAt: t.submittedAt, subtitle: `${t.origin} → ${t.destination}`, startDate: t.startDate, endDate: t.endDate, link: `/travel/${t.id}` }
    : e
      ? { type: 'EXPENSE', id: e.id, code: e.code, title: e.title, amount: Number(e.totalBase), status: e.status, round: e.round, flags: e.policyFlags, requester: e.employee, submittedAt: e.submittedAt, subtitle: `${e._count.lines} expense line${e._count.lines === 1 ? '' : 's'}`, link: `/expenses/${e.id}` }
      : null;
  const { travelRequest, expenseReport, ...rest } = s;
  return { ...rest, entity };
}

/** Pending items the user can act on, directly or as a delegate. */
export async function inbox(user) {
  const delegations = await delegatorsFor(user.id);
  const or = [{ approverId: user.id }];
  for (const d of delegations) {
    or.push({ approverId: d.delegatorId, ...(d.scope === 'ALL' ? {} : { entityType: d.scope }) });
  }
  // Oldest first, capped so a heavily delegated approver still gets a fast inbox.
  const steps = await prisma.approvalStep.findMany({ where: { status: 'PENDING', OR: or }, include: stepInclude, orderBy: { activatedAt: 'asc' }, take: 300 });
  await attachLineCounts(steps, (st) => st.expenseReport);
  return steps
    .map(shapeStep)
    .filter((s) => s.entity && s.entity.requester.id !== user.id)
    .map((s) => ({ ...s, onBehalfOf: s.approverId !== user.id ? s.approver : null }));
}

export async function history(user) {
  const steps = await prisma.approvalStep.findMany({
    where: { actedById: user.id, status: { in: ['APPROVED', 'REJECTED', 'RETURNED'] } },
    include: stepInclude,
    orderBy: { actedAt: 'desc' },
    take: 100,
  });
  await attachLineCounts(steps, (st) => st.expenseReport);
  return steps.map(shapeStep);
}

async function canActOn(user, step) {
  if (step.approverId === user.id) return { ok: true, onBehalf: null };
  const ds = await delegatorsFor(user.id, step.entityType);
  const d = ds.find((x) => x.delegatorId === step.approverId);
  return d ? { ok: true, onBehalf: d.delegator } : { ok: false };
}

/**
 * Approve / reject / return a pending step.
 * Enforces: actor is approver or valid delegate; requester never approves own item;
 * reject/return require a reason; parallel approvers must all approve.
 */
export async function act(user, stepId, action, comment) {
  const step = await prisma.approvalStep.findUnique({
    where: { id: stepId },
    include: { travelRequest: true, expenseReport: true },
  });
  if (!step) throw notFound('Approval step');
  if (step.status !== 'PENDING') throw conflict('This step has already been decided');
  const entity = step.travelRequest ?? step.expenseReport;
  const requesterId = step.travelRequest?.requesterId ?? step.expenseReport?.employeeId;
  if (entity.status !== 'PENDING' || entity.round !== step.round) throw conflict('This item is no longer awaiting approval');
  if (requesterId === user.id) throw forbidden('You cannot approve your own request');
  const perm = await canActOn(user, step);
  if (!perm.ok) throw forbidden('This approval is not assigned to you');
  if ((action === 'REJECTED' || action === 'RETURNED') && !comment?.trim()) throw badRequest('Please give a reason');

  const isTravel = step.entityType === 'TRAVEL';
  const where = isTravel ? { travelRequestId: entity.id } : { expenseReportId: entity.id };
  const now = new Date();
  const resolution = perm.onBehalf ? `Acted by ${user.name} on behalf of ${perm.onBehalf.name}` : step.resolution;

  // The decision and its audit entry commit together: no decision without an audit record.
  const outcome = await prisma.$transaction(async (tx) => {
   const o = await (async () => {
    // Optimistic guard against double-submit races.
    const upd = await tx.approvalStep.updateMany({
      where: { id: step.id, status: 'PENDING' },
      data: { status: action, actedById: user.id, actedAt: now, comment: comment?.trim() || null, resolution },
    });
    if (upd.count === 0) throw conflict('This step has already been decided');

    if (action === 'APPROVED') {
      const stillPending = await tx.approvalStep.count({ where: { ...where, round: step.round, level: step.level, status: 'PENDING' } });
      if (stillPending > 0) return { kind: 'partial' };
      const nextSteps = await activateNextLevel(tx, where, step.round, step.level);
      if (nextSteps?.length) return { kind: 'next', nextSteps };
      if (isTravel) {
        await tx.travelRequest.update({ where: { id: entity.id }, data: { status: 'APPROVED', decidedAt: now } });
      } else {
        await tx.expenseReport.update({ where: { id: entity.id }, data: { status: 'FINANCE_REVIEW', approvedAt: now } });
      }
      return { kind: 'final' };
    }

    await tx.approvalStep.updateMany({
      where: { ...where, round: step.round, status: { in: ['PENDING', 'WAITING'] } },
      data: { status: 'CANCELLED', resolution: `Closed after ${action.toLowerCase()} at level ${step.level}` },
    });
    const status = action === 'REJECTED' ? 'REJECTED' : 'RETURNED';
    if (isTravel) await tx.travelRequest.update({ where: { id: entity.id }, data: { status, decidedAt: action === 'REJECTED' ? now : null } });
    else await tx.expenseReport.update({ where: { id: entity.id }, data: { status } });
    return { kind: action };
   })();
    const after = o.kind === 'final' ? (isTravel ? 'APPROVED' : 'FINANCE_REVIEW') : o.kind === 'REJECTED' || o.kind === 'RETURNED' ? o.kind : 'PENDING';
    await audit(user, `${isTravel ? 'travel' : 'expense'}.step_${action.toLowerCase()}`, isTravel ? 'TRAVEL' : 'EXPENSE', entity.id, {
      code: entity.code, round: step.round, level: step.level, label: step.label, comment, onBehalfOf: perm.onBehalf?.name ?? null, rule: step.ruleName, ruleVersion: step.ruleVersion,
      step: { from: 'PENDING', to: action }, status: { from: entity.status, to: after },
    }, { tx });
    return o;
  });

  const label = isTravel ? 'travel request' : 'expense report';
  const link = isTravel ? `/travel/${entity.id}` : `/expenses/${entity.id}`;

  if (outcome.kind === 'next') {
    await notify(outcome.nextSteps.map((s) => s.approverId), {
      type: 'ACTION_REQUIRED', title: `Approval needed: ${entity.code}`, body: `${entity.title} is waiting for your review (${outcome.nextSteps[0].label}).`, link,
    });
    await notify(requesterId, { type: 'PROGRESS', title: `${entity.code} moved to the next approver`, body: `${step.label} approved by ${user.name}.`, link });
  } else if (outcome.kind === 'final') {
    if (isTravel) {
      await notify(requesterId, { type: 'APPROVED', title: `Travel approved: ${entity.code}`, body: `Your ${label} "${entity.title}" is fully approved. Have a great trip!`, link });
    } else {
      await notify(requesterId, { type: 'PROGRESS', title: `${entity.code} is with Finance`, body: `All approvers signed off. Finance will review and schedule your reimbursement.`, link });
      const finance = await prisma.user.findMany({ where: { role: 'FINANCE', active: true }, select: { id: true } });
      await notify(finance.map((f) => f.id), { type: 'ACTION_REQUIRED', title: `New report in Finance queue: ${entity.code}`, body: `${entity.title} is ready for Finance review.`, link: `/finance` });
    }
  } else if (outcome.kind === 'REJECTED') {
    await notify(requesterId, { type: 'REJECTED', title: `${entity.code} was rejected`, body: `${user.name}: ${comment}`, link });
  } else if (outcome.kind === 'RETURNED') {
    await notify(requesterId, { type: 'RETURNED', title: `${entity.code} needs changes`, body: `${user.name} returned your ${label}: ${comment}`, link });
  }
  return { ok: true, outcome: outcome.kind };
}

export async function bulkApprove(user, stepIds, comment) {
  const results = [];
  for (const id of stepIds) {
    try {
      await act(user, id, 'APPROVED', comment);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return { results, approved: results.filter((r) => r.ok).length };
}

/** Timeline for one entity: all rounds, ordered. */
export const timeline = (where) =>
  prisma.approvalStep.findMany({
    where,
    include: { approver: { select: { id: true, name: true, title: true } }, actedBy: { select: { id: true, name: true } } },
    orderBy: [{ round: 'asc' }, { level: 'asc' }, { createdAt: 'asc' }],
  });

/**
 * Reassign overdue steps to the approver's manager (or fallback). Runs from the cron job on
 * every API instance: each batch is claimed with FOR UPDATE SKIP LOCKED and its deadline moved
 * inside the same transaction, so no step is ever escalated twice.
 */
export async function escalateOverdue() {
  const settings = await getSettings();
  if (settings.escalationEnabled === false) return 0;
  const timeoutHours = Number(settings.approvalTimeoutHours ?? 48);
  const nextDue = () => new Date(Date.now() + timeoutHours * 3600 * 1000);
  let count = 0;

  for (let batch = 0; batch < 100; batch++) {
    const handled = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        SELECT id FROM "ApprovalStep" WHERE status = 'PENDING' AND "dueAt" < now()
        ORDER BY "dueAt" LIMIT 100 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return [];
      const steps = await tx.approvalStep.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        include: { approver: true, travelRequest: true, expenseReport: true },
      });
      const out = [];
      for (const s of steps) {
        const entity = s.travelRequest ?? s.expenseReport;
        const requesterId = s.travelRequest?.requesterId ?? s.expenseReport?.employeeId;
        let target = s.approver.managerId ? await tx.user.findUnique({ where: { id: s.approver.managerId } }) : null;
        if (!target?.active || target.id === requesterId) {
          target = settings.fallbackApproverId ? await tx.user.findUnique({ where: { id: settings.fallbackApproverId } }) : null;
        }
        if (!target?.active || target.id === requesterId || target.id === s.approverId) {
          // Nobody better to escalate to - extend the deadline and remind.
          await tx.approvalStep.update({ where: { id: s.id }, data: { dueAt: nextDue() } });
          out.push({ kind: 'remind', s, entity });
          continue;
        }
        await tx.approvalStep.update({
          where: { id: s.id },
          data: { approverId: target.id, escalated: true, dueAt: nextDue(), resolution: `Escalated from ${s.approver.name} after ${timeoutHours}h without action` },
        });
        out.push({ kind: 'escalate', s, entity, target });
      }
      return out;
    }, { timeout: 60_000 });

    if (!handled.length) break;
    // Side effects after commit.
    for (const h of handled) {
      const { s, entity } = h;
      if (h.kind === 'remind') {
        await notify(s.approverId, { type: 'REMINDER', title: `Reminder: ${entity.code} is overdue`, body: `${entity.title} has been waiting for your decision.`, link: '/approvals' });
        continue;
      }
      await audit(null, 'approval.escalated', s.entityType, entity.id, { code: entity.code, from: s.approver.name, to: h.target.name, level: s.level });
      await notify(h.target.id, { type: 'ACTION_REQUIRED', title: `Escalated to you: ${entity.code}`, body: `${entity.title} was escalated from ${s.approver.name}.`, link: '/approvals' });
      await notify(s.approverId, { type: 'INFO', title: `${entity.code} was escalated`, body: `It was reassigned to ${h.target.name} after the approval timeout.`, link: '/approvals' });
      count++;
    }
  }
  return count;
}
