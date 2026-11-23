import { prisma } from '../../db/pool.js';
import { getSettings } from '../../shared/utils/index.js';
import { selectRule, resolveApprover, DEFAULT_LEVELS } from './approvals.engine.js';

/** Show who will approve before the user submits (no records created). */
export async function previewRoute(userId, ctx) {
  const requester = await prisma.user.findUnique({ where: { id: userId } });
  const settings = await getSettings();
  const rule = await selectRule({ ...ctx, requester });
  const levels = Array.isArray(rule.levels) && rule.levels.length ? rule.levels : DEFAULT_LEVELS;
  const out = [];
  for (const lvl of levels) {
    const approvers = [];
    for (const spec of lvl.approvers ?? []) {
      const r = await resolveApprover(spec, requester, settings);
      if (r.user && !approvers.some((a) => a.id === r.user.id)) approvers.push({ id: r.user.id, name: r.user.name, note: r.note });
    }
    out.push({ label: lvl.label, approvers });
  }
  return { rule: { id: rule.id, name: rule.name, version: rule.version }, levels: out };
}

/** Find the level that returned the item in the latest round (for resubmission rules). */
export async function returningLevel(where, round) {
  const s = await prisma.approvalStep.findFirst({ where: { ...where, round, status: 'RETURNED' } });
  return s?.level ?? null;
}
