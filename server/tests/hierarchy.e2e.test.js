// Functional hierarchy: CEO routing for large amounts and manager sync from the directory.
// Needs a seeded database (npm run db:reset). Run: npm run test:e2e
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/pool.js';
import { previewRoute } from '../src/modules/approvals/approvals.preview.js';
import { applyDirectoryProfile, fetchDirectoryProfile } from '../src/modules/auth/auth.directory.service.js';
import { setManager } from '../src/shared/utils/orgTree.js';

const DOMAINS = ['utthunga.com'];
const tag = Date.now();
const made = [];
const mkUser = async (email, data = {}) => {
  const u = await prisma.user.create({ data: { email, name: email.split('@')[0], employeeId: `T-${tag}-${made.length}`, ...data } });
  made.push(u.id);
  return u;
};

after(async () => {
  await prisma.user.updateMany({ where: { id: { in: made } }, data: { managerId: null } });
  await prisma.user.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test('requests of ₹5,00,000+ climb the reporting line to the CEO', async () => {
  const rahul = await prisma.user.findUnique({ where: { email: 'rahul@voyage.io' } });
  const big = await previewRoute(rahul.id, { entityType: 'TRAVEL', amount: 600000, travelType: 'DOMESTIC' });
  assert.match(big.rule.name, /CEO approval/);
  assert.deepEqual(big.levels.map((l) => l.approvers[0].name), ['Neha Kapoor', 'Vikram Iyer', 'Meera Pillai', 'Asha Rao']);

  const small = await previewRoute(rahul.id, { entityType: 'EXPENSE', amount: 2000 });
  assert.deepEqual(small.levels.map((l) => l.approvers[0].name), ['Neha Kapoor']);

  const exception = await previewRoute(rahul.id, { entityType: 'EXPENSE', amount: 700000, hasException: true });
  assert.equal(exception.levels.at(-1).approvers[0].name, 'Asha Rao');
});

test('directory manager becomes "reports to", and unknown managers are created', async () => {
  const boss = await mkUser(`boss.${tag}@utthunga.com`, { role: 'EMPLOYEE' });
  const emp = await mkUser(`emp.${tag}@utthunga.com`);

  const r1 = await applyDirectoryProfile(emp, { profile: { jobTitle: 'Engineer', officeLocation: 'Bengaluru' }, manager: { mail: boss.email, displayName: 'Boss' } }, DOMAINS);
  assert.equal(r1.user.managerId, boss.id);
  assert.equal(r1.user.title, 'Engineer');
  assert.equal((await prisma.user.findUnique({ where: { id: boss.id } })).role, 'MANAGER', 'manager is promoted so they can approve and delegate');

  const newBossEmail = `newboss.${tag}@utthunga.com`;
  const r2 = await applyDirectoryProfile(r1.user, { profile: {}, manager: { id: 'abc-123', mail: newBossEmail, displayName: 'New Boss' } }, DOMAINS);
  const created = await prisma.user.findUnique({ where: { email: newBossEmail } });
  made.push(created.id);
  assert.equal(r2.user.managerId, created.id);
  assert.equal(created.role, 'MANAGER');
});

test('sync never creates a loop, ignores other domains, and keeps data when Graph fails', async () => {
  const a = await mkUser(`a.${tag}@utthunga.com`);
  let b = await mkUser(`b.${tag}@utthunga.com`);
  await setManager(b.id, a.id);
  b = await prisma.user.findUnique({ where: { id: b.id } });
  assert.deepEqual(b.ancestors, [a.id], 'org tree path is maintained');
  const loop = await applyDirectoryProfile(a, { profile: {}, manager: { mail: b.email } }, DOMAINS);
  assert.equal(loop.user.managerId, null);
  assert.equal(loop.changes.skipped, 'reporting loop');

  const external = await applyDirectoryProfile(b, { profile: {}, manager: { mail: 'someone@gmail.com' } }, DOMAINS);
  assert.equal(external.user.managerId, a.id, 'external manager is ignored, existing line kept');

  const failed = await applyDirectoryProfile(b, { profile: {}, manager: undefined }, DOMAINS);
  assert.equal(failed.user.managerId, a.id);
});

test('moving a manager re-paths their whole subtree', async () => {
  const top = await mkUser(`top.${tag}@utthunga.com`);
  const mid = await mkUser(`mid.${tag}@utthunga.com`);
  const leaf = await mkUser(`leaf.${tag}@utthunga.com`);
  await setManager(leaf.id, mid.id);
  await setManager(mid.id, top.id);
  assert.deepEqual((await prisma.user.findUnique({ where: { id: leaf.id } })).ancestors, [top.id, mid.id]);
  await setManager(mid.id, null);
  assert.deepEqual((await prisma.user.findUnique({ where: { id: leaf.id } })).ancestors, [mid.id]);
});

test('Graph client treats a 404 manager as "no manager"', async () => {
  const fake = async (url) => (url.includes('/me/manager') ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => ({ displayName: 'CEO' }) });
  const data = await fetchDirectoryProfile('token', fake);
  assert.equal(data.manager, null);
  assert.equal(data.profile.displayName, 'CEO');
});
