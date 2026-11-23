import bcrypt from 'bcryptjs';
import { prisma } from '../../db/pool.js';
import { badRequest, notFound, forbidden } from '../../shared/errors/AppError.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { paging } from '../../shared/utils/index.js';
import { forgetCachedUser } from '../../shared/middlewares/index.js';
import { setManager, isInSubtree } from '../../shared/utils/orgTree.js';

export const profileSelect = {
  id: true,
  employeeId: true,
  name: true,
  email: true,
  role: true,
  title: true,
  location: true,
  active: true,
  lastLoginAt: true,
  azureOid: true,
  department: { select: { id: true, name: true, code: true } },
  costCenter: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, name: true, email: true } },
};

const searchWhere = (search) =>
  search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

/** Admin people list - always paginated (the company has ~100k people). */
export async function listUsers(q) {
  const { skip, take, page, pageSize } = paging(q);
  const where = { ...searchWhere(q.search?.trim()) };
  if (q.role) where.role = q.role;
  if (q.active) where.active = q.active === 'true';
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: profileSelect, orderBy: { name: 'asc' }, skip, take }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

const directorySelect = { id: true, name: true, email: true, title: true, role: true };

/**
 * People picker: type-ahead search (max 20 results) or look up specific ids.
 * Never returns the whole directory.
 */
export async function directory(q) {
  if (q.ids) {
    const ids = String(q.ids).split(',').filter(Boolean).slice(0, 50);
    return prisma.user.findMany({ where: { id: { in: ids } }, select: directorySelect });
  }
  const search = q.search?.trim();
  return prisma.user.findMany({
    where: { active: true, ...(q.role ? { role: q.role } : {}), ...searchWhere(search) },
    select: directorySelect,
    orderBy: { name: 'asc' },
    take: Math.min(20, parseInt(q.take, 10) || 20),
  });
}

async function assertNoCycle(userId, managerId) {
  if (await isInSubtree(userId, managerId)) throw badRequest('This manager assignment would create a reporting loop');
}

export async function createUser(actor, data) {
  const { password, managerId, ...rest } = data;
  const created = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password || 'Welcome@123', 10) } });
  if (managerId) await setManager(created.id, managerId);
  const user = await prisma.user.findUnique({ where: { id: created.id }, select: profileSelect });
  await audit(actor, 'user.created', 'USER', user.id, { email: user.email, role: user.role });
  return user;
}

export async function updateUser(actor, id, data) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound('User');
  if (data.managerId !== undefined) {
    if (data.managerId === id) throw badRequest('A user cannot report to themselves');
    if (data.managerId) await assertNoCycle(id, data.managerId);
  }
  if (actor.id === id && data.role && data.role !== existing.role) throw forbidden('You cannot change your own role');
  const { password, managerId, ...rest } = data;
  const patch = { ...rest };
  if (password) patch.passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    if (Object.keys(patch).length) await tx.user.update({ where: { id }, data: patch });
    // Re-path the user's whole subtree when their manager changes.
    if (managerId !== undefined && managerId !== existing.managerId) await setManager(id, managerId || null, tx);
  });
  const user = await prisma.user.findUnique({ where: { id }, select: profileSelect });
  forgetCachedUser(id); // role / active changes apply immediately on this instance
  if (managerId !== undefined) rest.managerId = managerId;
  const changed = Object.keys(rest).filter((k) => String(existing[k] ?? '') !== String(rest[k] ?? ''));
  await audit(actor, 'user.updated', 'USER', id, { changed, ...(password ? { passwordReset: true } : {}) });
  return user;
}

// ---------- Delegations ----------

export const myDelegations = (userId) =>
  prisma.delegation.findMany({
    where: { OR: [{ delegatorId: userId }, { delegateId: userId }] },
    include: {
      delegator: { select: { id: true, name: true, email: true } },
      delegate: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startDate: 'desc' },
  });

export async function createDelegation(actor, data) {
  const delegatorId = actor.role === 'ADMIN' && data.delegatorId ? data.delegatorId : actor.id;
  if (data.delegateId === delegatorId) throw badRequest('You cannot delegate to yourself');
  if (new Date(data.endDate) < new Date(data.startDate)) throw badRequest('End date must be after start date');
  const delegate = await prisma.user.findUnique({ where: { id: data.delegateId } });
  if (!delegate?.active) throw badRequest('Delegate must be an active user');
  const d = await prisma.delegation.create({
    data: { delegatorId, delegateId: data.delegateId, scope: data.scope, startDate: new Date(data.startDate), endDate: new Date(data.endDate), reason: data.reason },
    include: { delegator: { select: { id: true, name: true } }, delegate: { select: { id: true, name: true } } },
  });
  await audit(actor, 'delegation.created', 'DELEGATION', d.id, { delegator: d.delegator.name, delegate: d.delegate.name, scope: d.scope, startDate: d.startDate, endDate: d.endDate });
  await notify(d.delegateId, {
    type: 'DELEGATION',
    title: `${d.delegator.name} delegated approvals to you`,
    body: `You can act on ${d.scope === 'ALL' ? 'all' : d.scope.toLowerCase()} approvals for ${d.delegator.name} until ${d.endDate.toDateString()}.`,
    link: '/approvals',
  });
  return d;
}

export async function revokeDelegation(actor, id) {
  const d = await prisma.delegation.findUnique({ where: { id } });
  if (!d) throw notFound('Delegation');
  if (d.delegatorId !== actor.id && actor.role !== 'ADMIN') throw forbidden();
  const updated = await prisma.delegation.update({ where: { id }, data: { revoked: true } });
  await audit(actor, 'delegation.revoked', 'DELEGATION', id);
  return updated;
}
