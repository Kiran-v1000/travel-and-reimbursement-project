import bcrypt from 'bcryptjs';
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { badRequest, unauthorized } from '../../shared/errors/AppError.js';
import { forgetCachedUser } from '../../shared/middlewares/index.js';
import { passwordProblem } from '../../db/seeds/reference-data.js';
import { audit } from '../audit/audit.service.js';
import { profileSelect } from '../users/users.service.js';
import { createSession, isPrivileged, revokeAllSessions } from './auth.sessions.js';
import { ssoConfigured } from './auth.sso.service.js';

// Used when the email is unknown, so both paths spend the same bcrypt time.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

export async function login(email, password, req) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit(null, 'auth.login_failed', 'USER', user?.id, { email });
    throw unauthorized('Incorrect email or password');
  }
  if (!user.active) throw unauthorized('Your account is inactive. Contact an administrator.');
  // Finance and Administrators sign in through Microsoft (company MFA) when that is required.
  if (env.PRIVILEGED_SSO_ONLY && ssoConfigured() && isPrivileged(user.role) && !env.BREAK_GLASS_EMAILS.includes(user.email.toLowerCase())) {
    await audit(user, 'auth.login_blocked', 'USER', user.id, { reason: 'PRIVILEGED_SSO_ONLY' });
    throw unauthorized('Finance and administrator accounts must sign in with Microsoft.');
  }
  const { token, maxAge } = await createSession(user, req, 'PASSWORD');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user, 'auth.login', 'USER', user.id, { method: 'password', ip: req?.ip ?? null });
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: profileSelect });
  return { token, maxAge, user: profile };
}

export async function me(userId) {
  const now = new Date();
  const [user, delegatedFrom, local] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: profileSelect }),
    prisma.delegation.findMany({
      where: { delegateId: userId, revoked: false, startDate: { lte: now }, endDate: { gte: now } },
      include: { delegator: { select: { id: true, name: true } } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
  ]);
  // hasPassword tells the UI whether to offer "Change password" (SSO-only users have none).
  return { user: { ...user, hasPassword: !!local?.passwordHash }, delegatedFrom };
}

/** Change your own password. Ends every other session. Returns a fresh session for this device. */
export async function changePassword(userId, currentPassword, newPassword, req) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw badRequest('This account signs in with Microsoft and has no password to change.');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    await audit(user, 'auth.password_change_failed', 'USER', user.id);
    throw badRequest('Your current password is not correct.');
  }
  const problem = passwordProblem(newPassword);
  if (problem) throw badRequest(`The new password needs ${problem}.`);
  if (await bcrypt.compare(newPassword, user.passwordHash)) throw badRequest('Choose a password different from the current one.');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date() },
  });
  forgetCachedUser(user.id);
  const ended = await revokeAllSessions(user.id, 'PASSWORD_CHANGED');
  await audit(user, 'auth.password_changed', 'USER', user.id, { sessionsEnded: ended });
  return createSession(updated, req, 'PASSWORD');
}
