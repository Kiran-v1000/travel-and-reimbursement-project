import { prisma } from '../../db/pool.js';
import { forbidden } from '../errors/AppError.js';

/**
 * Record-level access: owner, any approver (or their active delegate) on the record,
 * anyone above the owner in the reporting line, Finance, Admin and Auditor (read-only).
 */
export async function assertCanView(user, { ownerId, entityType, steps }) {
  if (user.id === ownerId) return;
  if (['ADMIN', 'AUDITOR', 'FINANCE'].includes(user.role)) return;
  if (steps?.some((s) => s.approverId === user.id || s.actedById === user.id)) return;
  const now = new Date();
  const delegators = await prisma.delegation.findMany({
    where: { delegateId: user.id, revoked: false, startDate: { lte: now }, endDate: { gte: now }, scope: { in: ['ALL', entityType] } },
    select: { delegatorId: true },
  });
  if (steps?.some((s) => delegators.some((d) => d.delegatorId === s.approverId))) return;
  // Reporting line: one indexed lookup instead of walking the chain.
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { ancestors: true } });
  if (owner?.ancestors?.includes(user.id)) return;
  throw forbidden('You do not have access to this record');
}

const RELATION = { requesterId: 'requester', employeeId: 'employee' };

/**
 * Prisma `where` fragment for "team" lists: the user plus everyone in their reporting line.
 * One indexed condition on the owner (GIN on ancestors) so it stays fast for a CEO over
 * 100k people. Items a user approves outside their line are in the Approvals inbox/history,
 * and opening them is still allowed by assertCanView.
 */
export async function visibilityWhere(user, ownerField, entityType) {
  if (['ADMIN', 'AUDITOR'].includes(user.role)) return {};
  if (user.role === 'FINANCE' && entityType === 'EXPENSE') return {};
  return { [RELATION[ownerField]]: { OR: [{ id: user.id }, { ancestors: { has: user.id } }] } };
}
