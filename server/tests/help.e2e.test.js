// User guide feedback ("Was this helpful?"), tested over HTTP.
// Needs the seeded demo database. Run: npm run test:e2e
// Uses an article slug no real article has, and removes its answers afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/pool.js';

let server;
let base;
const slug = `test-article-${Date.now()}`;

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await prisma.helpFeedback.deleteMany({ where: { slug } });
  server.close();
  await prisma.$disconnect();
});

async function login(email, password = 'Voyage@123') {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(res.status, 200, `login ${email}`);
  return res.headers.get('set-cookie').split(';')[0];
}
const call = (cookie, method, path, body) =>
  fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });

test('feedback needs a signed-in user', async () => {
  assert.equal((await call(null, 'POST', '/help/feedback', { slug, helpful: true })).status, 401);
});

test('one answer per person per article; answering again replaces it', async () => {
  const rahul = await login('rahul@voyage.io');
  const meera = await login('meera@voyage.io');
  assert.equal((await call(rahul, 'POST', '/help/feedback', { slug, helpful: true })).status, 200);
  assert.equal((await call(rahul, 'POST', '/help/feedback', { slug, helpful: false })).status, 200);
  assert.equal((await call(meera, 'POST', '/help/feedback', { slug, helpful: true })).status, 200);

  const rows = await prisma.helpFeedback.findMany({ where: { slug } });
  assert.equal(rows.length, 2);

  const admin = await login('admin@utthunga.com', 'admin@123');
  const res = await call(admin, 'GET', '/help/feedback');
  assert.equal(res.status, 200);
  const mine = (await res.json()).find((r) => r.slug === slug);
  assert.deepEqual(mine, { slug, helpful: 1, notHelpful: 1 });
});

test('bad input is rejected', async () => {
  const rahul = await login('rahul@voyage.io');
  for (const body of [{ slug: '../etc', helpful: true }, { slug: 'A B', helpful: true }, { slug, helpful: 'yes' }, { slug: 'x'.repeat(81), helpful: true }]) {
    assert.equal((await call(rahul, 'POST', '/help/feedback', body)).status, 422, JSON.stringify(body));
  }
});

test('only administrators can see the summary, and it names no one', async () => {
  for (const email of ['rahul@voyage.io', 'neha@voyage.io', 'sanjay@voyage.io', 'auditor@voyage.io']) {
    assert.equal((await call(await login(email), 'GET', '/help/feedback')).status, 403, email);
  }
  const rows = await (await call(await login('admin@utthunga.com', 'admin@123'), 'GET', '/help/feedback')).json();
  for (const r of rows) assert.deepEqual(Object.keys(r).sort(), ['helpful', 'notHelpful', 'slug']);
});

test('the guide contact is a public setting everyone can read', async () => {
  const res = await call(await login('rahul@voyage.io'), 'GET', '/admin/reference');
  assert.equal(res.status, 200);
  const ref = await res.json();
  assert.equal(typeof ref.settings.helpContact, 'string');
});
