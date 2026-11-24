import { prisma } from '../../db/pool.js';
import { sha256, toCsv } from '../../shared/utils/index.js';

const GENESIS = '0'.repeat(64);

// JSONB does not preserve key order, so hash a canonical (key-sorted) form.
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
};

const digest = (e) =>
  sha256(canonical([e.prevHash, e.actorId ?? null, e.action, e.entityType, e.entityId ?? null, e.details ?? {}, new Date(e.createdAt).toISOString()]));

// Never let secrets into the audit trail, whatever a caller passes in details.
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|otp|cvv|card[-_]?number|account[-_]?number|iban/i;
export function redact(v) {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) && typeof x !== 'boolean' ? '[redacted]' : redact(x)]));
  }
  return v;
}

async function writeEntry(tx, actor, action, entityType, entityId, details) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7411)`;
  const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
  const entry = {
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? 'System',
    action,
    entityType,
    entityId: entityId ?? null,
    // Normalise (Dates -> ISO strings, drop undefined) so stored == hashed.
    details: JSON.parse(JSON.stringify(redact(details ?? {}))),
    prevHash: last?.hash ?? GENESIS,
    createdAt: new Date(),
  };
  entry.hash = digest(entry);
  await tx.auditLog.create({ data: entry });
}

/**
 * Append a hash-chained audit entry. An advisory lock serialises writers so the chain never forks.
 *
 *  - { tx }: write inside the caller's transaction. The business change and its audit entry are
 *    saved together or not at all - used for approvals, payments, policy and rule changes.
 *  - { strict: true }: write on its own, but fail the request if the entry cannot be written.
 *  - neither: best effort (logged on failure) - for low-value events such as page views.
 */
export async function audit(actor, action, entityType, entityId, details = {}, { tx, strict = false } = {}) {
  if (tx) return writeEntry(tx, actor, action, entityType, entityId, details);
  try {
    await prisma.$transaction((t) => writeEntry(t, actor, action, entityType, entityId, details));
  } catch (err) {
    console.error('[audit] failed to write entry', action, err.message);
    if (strict) throw err;
  }
}

export async function listAudit(q) {
  const where = {};
  if (q.entityType) where.entityType = q.entityType;
  if (q.entityId) where.entityId = q.entityId;
  if (q.action) where.action = { contains: q.action, mode: 'insensitive' };
  if (q.search) {
    where.OR = [
      { actorName: { contains: q.search, mode: 'insensitive' } },
      { action: { contains: q.search, mode: 'insensitive' } },
      { entityId: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  const take = Math.min(500, parseInt(q.take, 10) || 100);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { seq: 'desc' }, take }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

/**
 * Recompute every hash in 5k-row pages (constant memory, millions of entries are fine);
 * report the first broken link, if any.
 */
export async function verifyChain() {
  const PAGE = 5000;
  let prev = GENESIS;
  let checked = 0;
  let after = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({ where: { seq: { gt: after } }, orderBy: { seq: 'asc' }, take: PAGE });
    for (const r of rows) {
      if (r.prevHash !== prev || digest(r) !== r.hash) return { valid: false, checked: checked + 1, brokenAt: r.seq };
      prev = r.hash;
      checked++;
    }
    if (rows.length < PAGE) break;
    after = rows[rows.length - 1].seq;
  }
  return { valid: true, checked };
}

export async function exportAuditCsv(q) {
  const { items } = await listAudit({ ...q, take: 500 });
  return toCsv(items, [
    { label: 'Seq', value: 'seq' },
    { label: 'Timestamp', value: 'createdAt' },
    { label: 'Actor', value: 'actorName' },
    { label: 'Action', value: 'action' },
    { label: 'Entity', value: 'entityType' },
    { label: 'Entity ID', value: 'entityId' },
    { label: 'Details', value: (r) => JSON.stringify(r.details) },
    { label: 'Hash', value: 'hash' },
  ]);
}
