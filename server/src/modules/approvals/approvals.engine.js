/**
 * Approval routing engine shared by travel requests and expense reports.
 *
 * - Picks the first matching active rule (lowest priority number wins).
 * - Resolves each approver from the reporting hierarchy / role / named user.
 * - Missing, inactive or self approvers go to the admin-defined fallback.
 * - Levels are sequential; approvers inside one level act in parallel.
 */
import { prisma } from '../../db/pool.js';
import { getSettings } from '../../shared/utils/index.js';

export const DEFAULT_LEVELS = [{ label: 'Reporting manager', approvers: [{ type: 'MANAGER' }] }];

export function ruleMatches(rule, ctx) {
  if (rule.entityType !== ctx.entityType) return false;
  if (ctx.amount < Number(rule.minAmount)) return false;
  if (rule.maxAmount != null && ctx.amount > Number(rule.maxAmount)) return false;
  if (rule.departmentId && rule.departmentId !== ctx.requester.departmentId) return false;
  if (rule.costCenterCode && rule.costCenterCode !== ctx.costCenterCode) return false;
  if (rule.travelType && rule.travelType !== ctx.travelType) return false;
  if (rule.onPolicyException && !ctx.hasException) return false;
  return true;
}

/** Choose the rule effective at submission time. Exception rules outrank normal ones. */
export async function selectRule(ctx) {
  const rules = await prisma.approvalRule.findMany({ where: { active: true, entityType: ctx.entityType }, orderBy: { priority: 'asc' } });
  const matching = rules.filter((r) => ruleMatches(r, ctx));
  const exception = matching.find((r) => r.onPolicyException);
  const rule = exception ?? matching[0];
  return rule ?? { id: null, name: 'Default: reporting manager', version: 0, levels: DEFAULT_LEVELS };
}

async function activeUser(id) {
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, active: true, managerId: true } });
  return u?.active ? u : null;
}

async function fallbackApprover(requesterId, settings) {
  const fb = await activeUser(settings.fallbackApproverId);
  if (fb && fb.id !== requesterId) return { user: fb, note: 'Routed to fallback approver' };
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', active: true, id: { not: requesterId } }, orderBy: { createdAt: 'asc' } });
  return { user: admin, note: 'Routed to administrator (no fallback configured)' };
}

/** Resolve one approver spec into a concrete user (with a note when fallback applied). */
export async function resolveApprover(spec, requester, settings) {
  let candidate = null;
  switch (spec.type) {
    case 'MANAGER':
      candidate = await activeUser(requester.managerId);
      break;
    case 'SKIP_MANAGER': {
      const m = await prisma.user.findUnique({ where: { id: requester.managerId ?? '' }, select: { managerId: true } });
      candidate = await activeUser(m?.managerId);
      break;
    }
    case 'DEPT_HEAD': {
      const d = requester.departmentId ? await prisma.department.findUnique({ where: { id: requester.departmentId } }) : null;
      candidate = await activeUser(d?.headId);
      break;
    }
    case 'ROLE': {
      const designated = settings.roleApprovers?.[spec.role];
      candidate = (await activeUser(designated)) ??
        (await prisma.user.findFirst({ where: { role: spec.role, active: true, id: { not: requester.id } }, orderBy: { createdAt: 'asc' } }));
      break;
    }
    case 'USER':
      candidate = await activeUser(spec.userId);
      break;
    case 'TOP_OF_LINE': {
      // Walk the reporting line to its top (the CEO in a functional hierarchy).
      let cursor = requester.managerId ? await prisma.user.findUnique({ where: { id: requester.managerId }, select: { id: true, managerId: true } }) : null;
      const seen = new Set();
      while (cursor?.managerId && !seen.has(cursor.managerId) && seen.size < 15) {
        seen.add(cursor.id);
        cursor = await prisma.user.findUnique({ where: { id: cursor.managerId }, select: { id: true, managerId: true } });
      }
      candidate = await activeUser(cursor?.id);
      break;
    }
    default:
      candidate = null;
  }
  if (candidate && candidate.id !== requester.id) return { user: candidate, note: null };
  const reason = !candidate ? 'Approver missing or inactive' : 'Requester cannot approve own item';
  const fb = await fallbackApprover(requester.id, settings);
  return { user: fb.user, note: `${reason}. ${fb.note}.` };
}

/**
 * Create the approval steps for a new routing round.
 * @param {object} o { entityType, entityId, requester, rule, round, skipLevelsBelow }
 * Returns the created steps (first level PENDING).
 */
export async function createRoute(tx, o) {
  const settings = await getSettings();
  const timeoutHours = Number(settings.approvalTimeoutHours ?? 48);
  const levels = Array.isArray(o.rule.levels) && o.rule.levels.length ? o.rule.levels : DEFAULT_LEVELS;
  const fk = o.entityType === 'TRAVEL' ? { travelRequestId: o.entityId } : { expenseReportId: o.entityId };
  const seen = new Set();
  const rows = [];
  let firstActive = null;

  for (let i = 0; i < levels.length; i++) {
    const level = i + 1;
    const lvl = levels[i];
    const resolved = [];
    for (const spec of lvl.approvers ?? []) {
      const r = await resolveApprover(spec, o.requester, settings);
      if (r.user && !resolved.some((x) => x.user.id === r.user.id)) resolved.push(r);
    }
    for (const r of resolved) {
      let status = 'WAITING';
      let resolution = r.note;
      if (seen.has(r.user.id)) {
        status = 'SKIPPED';
        resolution = 'Same approver already approves at an earlier level';
      } else if (o.skipLevelsBelow && level < o.skipLevelsBelow) {
        status = 'SKIPPED';
        resolution = 'Approved in the previous round (resubmission rule)';
      }
      seen.add(r.user.id);
      rows.push({ ...fk, entityType: o.entityType, round: o.round, level, label: lvl.label || `Level ${level}`, approverId: r.user.id, status, resolution, ruleName: o.rule.name, ruleVersion: o.rule.version });
    }
  }

  // Activate the first level that still has a WAITING step.
  const levelsWithWork = [...new Set(rows.filter((r) => r.status === 'WAITING').map((r) => r.level))].sort((a, b) => a - b);
  firstActive = levelsWithWork[0] ?? null;
  const now = new Date();
  for (const r of rows) {
    if (r.level === firstActive && r.status === 'WAITING') {
      r.status = 'PENDING';
      r.activatedAt = now;
      r.dueAt = new Date(now.getTime() + timeoutHours * 3600 * 1000);
    }
  }
  if (rows.length) await tx.approvalStep.createMany({ data: rows });
  return { firstActive, steps: rows };
}

/** Advance to the next level after a level completes. Returns true if more levels remain. */
export async function activateNextLevel(tx, where, round, afterLevel) {
  const settings = await getSettings();
  const timeoutHours = Number(settings.approvalTimeoutHours ?? 48);
  const next = await tx.approvalStep.findFirst({ where: { ...where, round, status: 'WAITING', level: { gt: afterLevel } }, orderBy: { level: 'asc' } });
  if (!next) return null;
  const now = new Date();
  await tx.approvalStep.updateMany({
    where: { ...where, round, level: next.level, status: 'WAITING' },
    data: { status: 'PENDING', activatedAt: now, dueAt: new Date(now.getTime() + timeoutHours * 3600 * 1000) },
  });
  return tx.approvalStep.findMany({ where: { ...where, round, level: next.level, status: 'PENDING' } });
}

/** Active delegations that let `userId` act for others today. */
export async function delegatorsFor(userId, scope) {
  const now = new Date();
  const ds = await prisma.delegation.findMany({
    where: {
      delegateId: userId,
      revoked: false,
      startDate: { lte: now },
      endDate: { gte: now },
      ...(scope ? { scope: { in: ['ALL', scope] } } : {}),
    },
    include: { delegator: { select: { id: true, name: true } } },
  });
  return ds;
}
