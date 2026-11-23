/**
 * Keeps the reporting hierarchy in step with the company directory (Microsoft Entra ID).
 * Runs at every SSO sign-in; failures never block the sign-in itself.
 */
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { audit } from '../audit/audit.service.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const PROFILE_FIELDS = 'displayName,jobTitle,department,officeLocation,mail,userPrincipalName,employeeId';

/** Read the signed-in user's profile and manager from Microsoft Graph (User.Read is enough). */
export async function fetchDirectoryProfile(accessToken, fetchImpl = fetch) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const me = await fetchImpl(`${GRAPH}/me?$select=${PROFILE_FIELDS}`, { headers });
  if (!me.ok) throw new Error(`Graph /me returned ${me.status}`);
  const mgr = await fetchImpl(`${GRAPH}/me/manager?$select=${PROFILE_FIELDS}`, { headers });
  // 404 = no manager set in the directory (e.g. the CEO).
  const manager = mgr.ok ? await mgr.json() : mgr.status === 404 ? null : undefined;
  return { profile: await me.json(), manager };
}

const emailOf = (p) => String(p?.mail || p?.userPrincipalName || '').trim().toLowerCase();

async function wouldCreateLoop(userId, managerId) {
  let cursor = managerId;
  for (let i = 0; cursor && i < 20; i++) {
    if (cursor === userId) return true;
    cursor = (await prisma.user.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId;
  }
  return false;
}

/**
 * Apply directory data to a user: fill empty profile fields and set "reports to" from the
 * directory manager. Unknown managers in an allowed domain are created as placeholder
 * accounts so the approval chain works before they first sign in.
 * `manager === undefined` means the lookup failed - leave the hierarchy alone.
 */
export async function applyDirectoryProfile(user, { profile, manager }, allowedDomains = env.SSO_ALLOWED_DOMAINS) {
  const changes = {};
  const patch = {};
  if (profile?.jobTitle && !user.title) patch.title = profile.jobTitle;
  if (profile?.officeLocation && !user.location) patch.location = profile.officeLocation;
  if (profile?.department && !user.departmentId) {
    const dept = await prisma.department.findFirst({ where: { name: { equals: profile.department, mode: 'insensitive' } } });
    if (dept) patch.departmentId = dept.id;
  }

  if (manager !== undefined) {
    let managerId = null;
    const mEmail = emailOf(manager);
    if (manager && mEmail && allowedDomains.includes(mEmail.split('@')[1])) {
      let m = await prisma.user.findUnique({ where: { email: mEmail } });
      if (!m) {
        m = await prisma.user.create({
          data: { email: mEmail, name: manager.displayName || mEmail.split('@')[0], title: manager.jobTitle || null, role: 'MANAGER', employeeId: `DIR-${manager.id?.replace(/-/g, '').slice(0, 10).toUpperCase() || Date.now()}` },
        });
        await audit(null, 'user.directory_provisioned', 'USER', m.id, { email: m.email, reason: `manager of ${user.email}` });
      } else if (m.role === 'EMPLOYEE') {
        await prisma.user.update({ where: { id: m.id }, data: { role: 'MANAGER' } });
        changes.managerPromoted = m.email;
      }
      managerId = m.id;
    }
    if (managerId !== (user.managerId ?? null)) {
      if (managerId && (await wouldCreateLoop(user.id, managerId))) {
        changes.skipped = 'reporting loop';
      } else if (managerId || manager === null) {
        patch.managerId = managerId;
      }
    }
  }

  if (!Object.keys(patch).length) return { user, changes };
  const updated = await prisma.user.update({ where: { id: user.id }, data: patch });
  if ('managerId' in patch) changes.managerId = { from: user.managerId ?? null, to: patch.managerId };
  Object.assign(changes, Object.fromEntries(Object.keys(patch).filter((k) => k !== 'managerId').map((k) => [k, patch[k]])));
  await audit(updated, 'user.directory_synced', 'USER', updated.id, changes);
  return { user: updated, changes };
}

/** Best-effort sync used by the SSO callback. */
export async function syncFromDirectory(user, accessToken) {
  if (!env.SSO_SYNC_DIRECTORY || !accessToken) return user;
  try {
    const data = await fetchDirectoryProfile(accessToken);
    return (await applyDirectoryProfile(user, data)).user;
  } catch (err) {
    console.error('[sso] directory sync failed', err.message);
    return user;
  }
}
