// Integration tests against a seeded database (npm run db:reset first).
// Run: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/pool.js';

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

async function login(email) {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Voyage@123' }) });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

const call = (cookie, path, opts = {}) =>
  fetch(`${base}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', cookie, ...(opts.headers ?? {}) } });

test('health reports the database is up', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).db, 'up');
});

test('protected routes require a session', async () => {
  assert.equal((await fetch(`${base}/travel`)).status, 401);
});

test('wrong password is rejected', async () => {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'rahul@voyage.io', password: 'nope' }) });
  assert.equal(res.status, 401);
});

test('employees cannot reach finance or admin endpoints', async () => {
  const c = await login('priya@voyage.io');
  assert.equal((await call(c, '/finance/queue')).status, 403);
  assert.equal((await call(c, '/admin/rules')).status, 403);
});

test('travel request routes through three levels and cannot be self-approved', async () => {
  const rahul = await login('rahul@voyage.io');
  const cc = (await (await call(rahul, '/admin/reference')).json()).costCenters[0];
  const start = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 44 * 86400000).toISOString().slice(0, 10);
  const created = await (await call(rahul, '/travel', {
    method: 'POST',
    body: JSON.stringify({ title: 'E2E conference', purpose: 'Integration test for international routing', travelType: 'INTERNATIONAL', origin: 'Bengaluru', destination: 'Berlin', startDate: start, endDate: end, estTransport: 900, estLodging: 700, estMeals: 200, estOther: 0, currency: 'EUR', costCenterId: cc.id }),
  })).json();
  const submitted = await (await call(rahul, `/travel/${created.id}/submit`, { method: 'POST', body: '{}' })).json();
  assert.equal(submitted.status, 'PENDING');

  const detail = await (await call(rahul, `/travel/${created.id}`)).json();
  assert.equal(new Set(detail.steps.map((s) => s.level)).size, 3);

  const pending = detail.steps.find((s) => s.status === 'PENDING');
  const self = await call(rahul, `/approvals/${pending.id}/act`, { method: 'POST', body: JSON.stringify({ action: 'APPROVED' }) });
  assert.equal(self.status, 403);

  const withdrawn = await call(rahul, `/travel/${created.id}/withdraw`, { method: 'POST' });
  assert.equal(withdrawn.status, 200);
});

test('audit chain verifies', async () => {
  const c = await login('auditor@voyage.io');
  const v = await (await call(c, '/audit/verify')).json();
  assert.equal(v.valid, true);
});
