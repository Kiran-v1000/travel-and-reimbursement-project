/**
 * Server-side sessions. The JWT only carries the session id (sid); the Session row decides
 * whether it is still valid, so a session can be ended before the token expires:
 *   - signing out ends that session;
 *   - deactivation, password change / reset end every session of the person;
 *   - inactivity ends a session (shorter limits for Finance and Administrators);
 *   - an absolute lifetime caps every session (shorter for Finance and Administrators).
 * Rows are cached briefly per server, so a revocation reaches every server within SESSION_CACHE_MS.
 */
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';

const PRIVILEGED = new Set(['FINANCE', 'ADMIN']);
const SESSION_CACHE_MS = 15_000;
const TOUCH_EVERY_MS = 60_000; // write lastSeenAt at most once a minute per session
const cache = new Map();
const CACHE_MAX = 50_000;

export const isPrivileged = (role) => PRIVILEGED.has(role);

/** Lifetime and inactivity limit for a role. */
export function policyFor(role) {
  return isPrivileged(role)
    ? { maxMs: env.PRIVILEGED_SESSION_HOURS * 3600_000, idleMs: env.PRIVILEGED_IDLE_MINUTES * 60_000 }
    : { maxMs: env.SESSION_HOURS * 3600_000, idleMs: env.SESSION_IDLE_MINUTES * 60_000 };
}

/** Open a session and return the signed token plus the cookie lifetime. */
export async function createSession(user, req, method) {
  const { maxMs } = policyFor(user.role);
  const s = await prisma.session.create({
    data: {
      userId: user.id,
      method,
      expiresAt: new Date(Date.now() + maxMs),
      ip: req?.ip ?? null,
      userAgent: req?.get?.('user-agent')?.slice(0, 200) ?? null,
    },
  });
  const token = jwt.sign({ sub: user.id, sid: s.id }, env.JWT_SECRET, { expiresIn: Math.floor(maxMs / 1000) });
  return { token, maxAge: maxMs, sessionId: s.id };
}

async function load(sid) {
  const hit = cache.get(sid);
  if (hit && hit.exp > Date.now()) return hit.session;
  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(sid, { session, exp: Date.now() + SESSION_CACHE_MS });
  return session;
}

/**
 * Check a session for a request. Returns { ok: true } or { ok: false, reason, message }.
 * Records activity (throttled) so the inactivity limit slides while the person works.
 */
export async function checkSession(sid, user) {
  if (!sid) return { ok: false, reason: 'NO_SESSION', message: 'Please sign in again.' };
  const s = await load(sid);
  if (!s || s.userId !== user.id) return { ok: false, reason: 'UNKNOWN', message: 'Please sign in again.' };
  if (s.revokedAt) return { ok: false, reason: s.revokedReason ?? 'REVOKED', message: s.revokedReason === 'IDLE' ? 'You were signed out after a period of inactivity.' : 'Your session has ended. Please sign in again.' };
  const now = Date.now();
  if (s.expiresAt.getTime() <= now) return { ok: false, reason: 'EXPIRED', message: 'Your session has expired. Please sign in again.' };
  const { idleMs } = policyFor(user.role);
  if (now - s.lastSeenAt.getTime() > idleMs) {
    await revokeSession(sid, 'IDLE');
    return { ok: false, reason: 'IDLE', message: 'You were signed out after a period of inactivity.' };
  }
  if (now - s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    s.lastSeenAt = new Date(now);
    prisma.session.update({ where: { id: sid }, data: { lastSeenAt: s.lastSeenAt } }).catch(() => {});
  }
  return { ok: true, session: s };
}

export async function revokeSession(sid, reason) {
  cache.delete(sid);
  await prisma.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
}

/** End every session of a person (optionally keeping one, e.g. the one changing the password). */
export async function revokeAllSessions(userId, reason, { except, tx = prisma } = {}) {
  for (const [sid, v] of cache) if (v.session?.userId === userId && sid !== except) cache.delete(sid);
  const r = await tx.session.updateMany({
    where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return r.count;
}

/** Active sessions of a person, newest first (for "Signed-in devices"). */
export const listSessions = (userId) =>
  prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, method: true, createdAt: true, lastSeenAt: true, expiresAt: true, ip: true, userAgent: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
  });

/** Nightly: drop session rows that ended more than 30 days ago (kept a while for investigations). */
export async function purgeOldSessions() {
  const cutoff = new Date(Date.now() - 30 * 86400_000);
  const r = await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } });
  return r.count;
}
