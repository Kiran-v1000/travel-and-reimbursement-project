// Analytics snapshots: stored results are shared, served at once, refreshed in the background,
// and the nightly build lands on the same key the page asks for. Needs a seeded database.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/pool.js';
import { forget } from '../src/shared/utils/cache.js';
import { analytics, keyOf, rangeOf, precomputeAnalytics } from '../src/modules/reports/reports.service.js';

const finance = await prisma.user.findFirst({ where: { role: 'FINANCE', email: { endsWith: '@voyage.io' } } });
// A manager with a manager of their own (the top of the company shares the organisation view).
const manager = await prisma.user.findFirst({ where: { role: 'MANAGER', email: { endsWith: '@voyage.io' }, managerId: { not: null }, reports: { some: {} } }, orderBy: { createdAt: 'asc' } });
const year = new Date().getUTCFullYear();
const today = new Date().toISOString().slice(0, 10);
const ytd = { from: `${year}-01-01`, to: today };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

after(() => prisma.$disconnect());

test('the page\'s year-to-date request and the nightly build use the same key', () => {
  const page = rangeOf(ytd);
  const nightly = rangeOf({});
  assert.equal(keyOf(null, page.from, page.to), keyOf(null, nightly.from, nightly.to));
  assert.equal(keyOf(null, page.from, page.to), `org|${year}-01-01|now`);
  // Yesterday as the end date is still "up to now" (time zones disagree about today).
  const y = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const r = rangeOf({ from: ytd.from, to: y });
  assert.ok(r.openEnded);
  // A range that ended in the past keeps its own key.
  const past = rangeOf({ from: `${year - 1}-01-01`, to: `${year - 1}-06-30` });
  assert.equal(keyOf(null, past.from, past.to), `org|${year - 1}-01-01|${year - 1}-06-30`);
});

test('a result is stored, shared and carries computedAt', async () => {
  const { from, to } = rangeOf(ytd);
  const key = keyOf(manager.id, from, to);
  await prisma.analyticsSnapshot.deleteMany({ where: { key } });
  forget('analytics', key);

  const first = await analytics(manager, ytd);
  assert.ok(first.computedAt, 'has computedAt');
  const snap = await prisma.analyticsSnapshot.findUnique({ where: { key } });
  assert.ok(snap, 'stored');
  assert.equal(snap.data.computedAt, first.computedAt);

  // Another server (empty memory cache) is served the stored result, not a recomputation.
  forget('analytics', key);
  const second = await analytics(manager, ytd);
  assert.equal(second.computedAt, first.computedAt);
  assert.equal(second.kpis.totalSpend, first.kpis.totalSpend);
});

test('an old result is served at once and refreshed in the background', async () => {
  const { from, to } = rangeOf(ytd);
  const key = keyOf(manager.id, from, to);
  const old = new Date(Date.now() - 2 * 3600_000);
  await prisma.analyticsSnapshot.update({ where: { key }, data: { computedAt: old } });
  forget('analytics', key);

  const served = await analytics(manager, ytd);
  assert.equal(served.refreshing, true, 'flagged as refreshing');
  for (let i = 0; i < 100 && (await prisma.analyticsSnapshot.findUnique({ where: { key } })).computedAt.getTime() === old.getTime(); i++) await sleep(100);
  const fresh = await prisma.analyticsSnapshot.findUnique({ where: { key } });
  assert.ok(fresh.computedAt > old, 'refreshed in the background');

  const next = await analytics(manager, ytd);
  assert.equal(next.refreshing, undefined, 'next request gets the fresh result');
  assert.equal(next.computedAt, fresh.data.computedAt);
});

test('nightly build: one server per hour, builds the organisation view', async () => {
  await prisma.counter.deleteMany({ where: { key: 'analytics-precompute' } });
  const r = await precomputeAnalytics({ minTeam: 1000 });
  assert.ok(r && r.built >= 1 && r.built === r.scopes, JSON.stringify(r));
  assert.equal(await precomputeAnalytics({ minTeam: 1000 }), null, 'a second server in the same hour does nothing');
  const { from, to } = rangeOf({});
  assert.ok(await prisma.analyticsSnapshot.findUnique({ where: { key: keyOf(null, from, to) } }));
  const org = await analytics(finance, ytd);
  assert.ok(org.computedAt);
});
