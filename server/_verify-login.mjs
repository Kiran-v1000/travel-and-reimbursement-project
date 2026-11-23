import { prisma } from './src/db/pool.js';
import * as svc from './src/modules/auth/auth.service.js';

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('db: ok');
  const u = await prisma.user.findUnique({ where: { email: 'rahul@voyage.io' } });
  console.log('rahul user:', u ? `${u.id} active=${u.active} hasPassword=${!!u.passwordHash}` : 'NOT FOUND');
  try {
    await svc.login('rahul@voyage.io', 'Voyage@123');
    console.log('login: ok');
  } catch (e) {
    console.log('login:', e.status ?? '', e.message);
  }
} catch (e) {
  console.error('verify failed:', e.message);
} finally {
  await prisma.$disconnect();
}