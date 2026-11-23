import { prisma } from '../../db/pool.js';
import { forbidden } from '../errors/AppError.js';

/**
 * Record-level access: owner, any approver (or their active delegate) on the record,
 * the owner's manager chain, Finance (expenses), Admin and Auditor (read-only).
 */
export async function assertCanView(user, { ownerId, entityType, steps }) {
  if (user.id === ownerId) return;
  if (['ADMIN', 'AUDITOR'].includes(user.role)) return;
  if (user.role === 'FINANCE') return;
  if (steps?.some((s) => s.approverId === user.id || s.actedById === user.id)) return;
  const now = new Date();
  const delegators = await prisma.delegation.findMany({
    where: { delegateId: user.id, revoked: false, startDate: { lte: now }, endDate: { gte: now }, scope: { in: ['ALL', entityType] } },
    select: { delegatorId: true },
  });
  if (steps?.some((s) => delegators.some((d) => d.delegatorId === s.approverId))) return;
  // Manager chain (up to 6 levels).
  let cursor = await prisma.user.findUnique({ where: { id: ownerId }, select: { managerId: true } });
  for (let i = 0; i < 6 && cursor?.managerId; i++) {
    if (cursor.managerId === user.id) return;
    cursor = await prisma.user.findUnique({ where: { id: cursor.managerId }, select: { managerId: true } });
  }
  throw forbidden('You do not have access to this record');
}

/** Prisma `where` fragment restricting list queries to what the user may see. */
export async function visibilityWhere(user, ownerField, entityType) {
  if (['ADMIN', 'AUDITOR'].includes(user.role)) return {};
  if (user.role === 'FINANCE' && entityType === 'EXPENSE') return {};
  const reports = await prisma.user.findMany({ where: { managerId: user.id }, select: { id: true } });
  return {
    OR: [
      { [ownerField]: user.id },
      { [ownerField]: { in: reports.map((r) => r.id) } },
      { steps: { some: { OR: [{ approverId: user.id }, { actedById: user.id }] } } },
    ],
  };
}
