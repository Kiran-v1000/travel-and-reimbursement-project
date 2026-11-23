import bcrypt from 'bcryptjs';
import { prisma } from '../../db/pool.js';
import { badRequest, notFound, forbidden } from '../../shared/errors/AppError.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';

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

export async function listUsers(q) {
  const where = {};
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
      { employeeId: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  if (q.role) where.role = q.role;
  if (q.active) where.active = q.active === 'true';
  return prisma.user.findMany({ where, select: profileSelect, orderBy: { name: 'asc' } });
}

/** Lightweight directory used by pickers (delegates, travelers). */
export const directory = () =>
  prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, title: true, role: true }, orderBy: { name: 'asc' } });

async function assertNoCycle(userId, managerId) {
  let cursor = managerId;
  const seen = new Set();
  while (cursor) {
    if (cursor === userId) throw badRequest('This manager assignment would create a reporting loop');
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const m = await prisma.user.findUnique({ where: { id: cursor }, select: { managerId: true } });
    cursor = m?.managerId;
  }
}

export async function createUser(actor, data) {
  const { password, ...rest } = data;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(password || 'Welcome@123', 10) },
    select: profileSelect,
  });
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
  const { password, ...rest } = data;
  const patch = { ...rest };
  if (password) patch.passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.update({ where: { id }, data: patch, select: profileSelect });
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
