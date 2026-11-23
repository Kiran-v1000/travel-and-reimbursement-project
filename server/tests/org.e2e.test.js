// Org chart: chain order, team sizes, report ordering and viewer relations.
// Needs a seeded database. Run: npm run test:e2e
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/pool.js';
import { chart, roots } from '../src/modules/org/org.service.js';

// Seeded people only - other test files add and remove temporary people in parallel.
const seeded = { email: { endsWith: '@voyage.io' } };
const leaf = await prisma.user.findFirst({ where: { ...seeded, active: true, reports: { none: {} }, ancestors: { isEmpty: false } }, orderBy: { createdAt: 'asc' }, select: { id: true, ancestors: true, managerId: true } });
const top = await prisma.user.findUnique({ where: { id: leaf.ancestors[0] } });

after(() => prisma.$disconnect());

test('chain runs from the top of the organisation down to the direct manager', async () => {
  const c = await chart(leaf, null);
  assert.equal(c.person.id, leaf.id);
  assert.equal(c.relation, 'SELF');
  assert.deepEqual(c.chain.map((m) => m.id), leaf.ancestors);
  assert.equal(c.chain.at(-1).id, leaf.managerId);
  assert.equal(c.person.directs, 0);
  assert.equal(c.reports.length, 0);
});

test('team size counts everyone below, and reports are biggest teams first', async () => {
  const c = await chart(leaf, top.id);
  const below = await prisma.user.count({ where: { active: true, ancestors: { has: top.id } } });
  assert.equal(c.person.teamSize, below);
  assert.equal(c.reportTotal, await prisma.user.count({ where: { managerId: top.id, active: true } }));
  for (let i = 1; i < c.reports.length; i++) assert.ok(c.reports[i - 1].teamSize >= c.reports[i].teamSize, 'sorted by team size');
  assert.equal(c.relation, 'MY_MANAGER_LINE', 'the top person is in the leaf\'s management line');
});

test('relation from a manager looking down', async () => {
  const c = await chart(top, leaf.id);
  assert.equal(c.relation, 'IN_MY_TEAM');
});

test('roots include the top of the seeded organisation', async () => {
  const r = await roots();
  assert.ok(r.some((p) => p.id === top.id));
});

test('unknown person is a 404', async () => {
  await assert.rejects(chart(leaf, 'does-not-exist'), /not found/);
});
