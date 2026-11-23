import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { badRequest, unauthorized } from '../../shared/errors/AppError.js';
import { forgetCachedUser } from '../../shared/middlewares/index.js';
import { passwordProblem } from '../../db/seeds/reference-data.js';
import { audit } from '../audit/audit.service.js';
import { profileSelect } from '../users/users.service.js';

// Used when the email is unknown, so both paths spend the same bcrypt time.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

export const signSession = (user) => jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

export async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit(null, 'auth.login_failed', 'USER', user?.id, { email });
    throw unauthorized('Incorrect email or password');
  }
  if (!user.active) throw unauthorized('Your account is inactive. Contact an administrator.');
  const token = signSession(user);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user, 'auth.login', 'USER', user.id);
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: profileSelect });
  return { token, user: profile };
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

/** Change your own password. Signs out every older session. Returns a fresh session token. */
export async function changePassword(userId, currentPassword, newPassword) {
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
  await audit(user, 'auth.password_changed', 'USER', user.id);
  // Issue the new token a moment after passwordChangedAt so it is not treated as "older".
  await new Promise((r) => setTimeout(r, 1100));
  return signSession(updated);
}
