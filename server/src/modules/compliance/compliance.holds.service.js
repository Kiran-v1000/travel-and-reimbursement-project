/**
 * Legal holds. A hold freezes records for an audit, dispute or investigation:
 *  - the retention job never purges them;
 *  - their owner cannot edit, withdraw or delete them, and Finance cannot re-code them.
 *
 * Scopes
 *  - EMPLOYEE: everything the person had raised when the hold was placed
 *  - EXPENSE / TRAVEL: one record (a trip hold also covers the trip's expense reports)
 *  - PERIOD: every record created in the date range (and before the hold was placed)
 * Records created after an EMPLOYEE / PERIOD hold are not frozen, so the person can keep working.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../shared/errors/AppError.js';
import { audit } from '../audit/audit.service.js';

/** Serialises hold placement with each retention purge batch (see retention service). */
export const HOLD_LOCK = 7412;

const holdSelect = {
  id: true, scope: true, subject: true, reason: true, reference: true, userId: true, entityId: true, fromDate: true, toDate: true,
  placedAt: true, releasedAt: true, releaseReason: true,
  placedBy: { select: { name: true } }, releasedBy: { select: { name: true } },
};

/** Active holds that cover one record. `kind` is EXPENSE or TRAVEL. */
export function holdsFor(kind, record) {
  const ownerId = kind === 'EXPENSE' ? record.employeeId : record.requesterId;
  const or = [
    { scope: 'EMPLOYEE', userId: ownerId, placedAt: { gte: record.createdAt } },
    { scope: kind, entityId: record.id },
    { scope: 'PERIOD', fromDate: { lte: record.createdAt }, toDate: { gte: record.createdAt }, placedAt: { gte: record.createdAt } },
  ];
  if (kind === 'EXPENSE' && record.travelRequestId) or.push({ scope: 'TRAVEL', entityId: record.travelRequestId });
  return prisma.legalHold.findMany({ where: { releasedAt: null, OR: or }, select: holdSelect, orderBy: { placedAt: 'asc' } });
}

/** Refuse a change to a purged or held record. */
export async function assertChangeable(kind, record) {
  if (record.purgedAt) throw conflict('This record was archived under the retention policy and can no longer be changed.');
  const holds = await holdsFor(kind, record);
  if (holds.length) throw conflict(`This record is under legal hold (${holds[0].reason}) and cannot be changed or deleted.`);
}

/**
 * SQL condition "an active hold covers this row" for the retention queries.
 * `alias` is the table alias; expense rows also match holds on their trip.
 */
export function heldSql(kind, alias) {
  const a = Prisma.raw(`"${alias}"`);
  const owner = Prisma.raw(`"${alias}"."${kind === 'EXPENSE' ? 'employeeId' : 'requesterId'}"`);
  const tripClause = kind === 'EXPENSE' ? Prisma.sql`OR (h.scope = 'TRAVEL' AND h."entityId" = ${a}."travelRequestId")` : Prisma.empty;
  return Prisma.sql`EXISTS (SELECT 1 FROM "LegalHold" h WHERE h."releasedAt" IS NULL AND (
      (h.scope = 'EMPLOYEE' AND h."userId" = ${owner} AND ${a}."createdAt" <= h."placedAt")
   OR (h.scope = ${Prisma.raw(`'${kind}'`)} AND h."entityId" = ${a}.id)
   ${tripClause}
   OR (h.scope = 'PERIOD' AND ${a}."createdAt" BETWEEN h."fromDate" AND h."toDate" AND ${a}."createdAt" <= h."placedAt")))`;
}

export async function list({ status = 'ACTIVE' } = {}) {
  return prisma.legalHold.findMany({
    where: status === 'RELEASED' ? { releasedAt: { not: null } } : status === 'ALL' ? {} : { releasedAt: null },
    select: holdSelect,
    orderBy: { placedAt: 'desc' },
    take: 200,
  });
}

const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Work out what a new hold covers and a readable subject line. */
async function resolveSubject({ scope, userId, code, from, to }) {
  if (scope === 'EMPLOYEE') {
    const u = await prisma.user.findUnique({ where: { id: userId ?? '' }, select: { id: true, name: true, employeeId: true } });
    if (!u) throw badRequest('Choose the employee to hold');
    return { userId: u.id, subject: `${u.name} (${u.employeeId})` };
  }
  if (scope === 'EXPENSE' || scope === 'TRAVEL') {
    const c = String(code ?? '').trim().toUpperCase();
    const rec = scope === 'EXPENSE'
      ? await prisma.expenseReport.findUnique({ where: { code: c }, select: { id: true, code: true, title: true } })
      : await prisma.travelRequest.findUnique({ where: { code: c }, select: { id: true, code: true, title: true } });
    if (!rec) throw badRequest(`No ${scope === 'EXPENSE' ? 'expense report' : 'travel request'} with code ${c || '(blank)'}`);
    return { entityId: rec.id, subject: `${rec.code} - ${rec.title}` };
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw badRequest('Choose a valid date range');
  return { fromDate: start, toDate: end, subject: `Records created ${day(start)} - ${day(end)}` };
}

export async function place(user, body) {
  const target = await resolveSubject(body);
  const hold = await prisma.$transaction(async (tx) => {
    // Wait for any purge batch in flight, so nothing this hold covers is purged after it is placed.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOLD_LOCK})`;
    const dup = await tx.legalHold.findFirst({
      where: { releasedAt: null, scope: body.scope, userId: target.userId ?? null, entityId: target.entityId ?? null, fromDate: target.fromDate ?? null, toDate: target.toDate ?? null },
    });
    if (dup) throw conflict('An identical hold is already active');
    return tx.legalHold.create({ data: { scope: body.scope, ...target, reason: body.reason, reference: body.reference || null, placedById: user.id }, select: holdSelect });
  });
  await audit(user, 'legal_hold.placed', 'LEGAL_HOLD', hold.id, { scope: hold.scope, subject: hold.subject, reason: hold.reason, reference: hold.reference });
  return hold;
}

export async function release(user, id, { reason }) {
  const hold = await prisma.legalHold.findUnique({ where: { id } });
  if (!hold) throw notFound('Legal hold');
  if (hold.releasedAt) throw conflict('This hold was already released');
  const updated = await prisma.legalHold.update({
    where: { id },
    data: { releasedAt: new Date(), releasedById: user.id, releaseReason: reason },
    select: holdSelect,
  });
  await audit(user, 'legal_hold.released', 'LEGAL_HOLD', id, { subject: hold.subject, reason });
  return updated;
}
