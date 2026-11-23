import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { unauthorized } from '../../shared/errors/AppError.js';
import { audit } from '../audit/audit.service.js';
import { profileSelect } from '../users/users.service.js';

// Used when the email is unknown, so both paths spend the same bcrypt time.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

export async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit(null, 'auth.login_failed', 'USER', user?.id, { email });
    throw unauthorized('Incorrect email or password');
  }
  if (!user.active) throw unauthorized('Your account is inactive. Contact an administrator.');
  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user, 'auth.login', 'USER', user.id);
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: profileSelect });
  return { token, user: profile };
}

export async function me(userId) {
  const now = new Date();
  const [user, delegatedFrom] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: profileSelect }),
    prisma.delegation.findMany({
      where: { delegateId: userId, revoked: false, startDate: { lte: now }, endDate: { gte: now } },
      include: { delegator: { select: { id: true, name: true } } },
    }),
  ]);
  return { user, delegatedFrom };
}
