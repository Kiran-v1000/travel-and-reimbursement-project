// Authorization and security controls, tested over HTTP as real users would hit the API.
// Every check tries to reach data or actions outside the caller's scope - by changing IDs,
// calling endpoints the UI hides, or acting on their own records where that is forbidden.
// Needs the seeded demo database (npm run db:reset). Run: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/pool.js';

let server;
let base;
const tag = Date.now();
const made = { reports: [], users: [] };

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await prisma.payment.deleteMany({ where: { reportId: { in: made.reports } } });
  await prisma.expenseReport.deleteMany({ where: { id: { in: made.reports } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
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
const status = async (...a) => (await call(...a)).status;

const user = (email) => prisma.user.findUnique({ where: { email } });

/** A report in a given state, owned by `owner`, created directly so tests do not depend on demo data. */
async function report(owner, status, { flags = [], total = 1000 } = {}) {
  const cat = await prisma.expenseCategory.findFirst({ where: { active: true } });
  const r = await prisma.expenseReport.create({
    data: {
      code: `AZ-${tag}-${made.reports.length}`, employeeId: owner.id, title: 'Authorization test', purpose: 'Testing access rules', status,
      totalBase: total, policyFlags: flags, round: 1,
      lines: { create: [{ date: new Date(), categoryId: cat.id, merchant: 'Test merchant', amount: total, baseAmount: total }] },
      ...(status === 'SCHEDULED' ? { payment: { create: { method: 'BANK_TRANSFER', amount: total, status: 'SCHEDULED', scheduledFor: new Date(), recordedById: owner.id } } } : {}),
    },
  });
  made.reports.push(r.id);
  return r;
}

// ---------------------------------------------------------------- record-level access
test('an employee cannot read or change another employee\'s records by ID', async () => {
  const [rahul, ananya] = [await user('rahul@voyage.io'), await user('ananya@voyage.io')];
  const c = await login('rahul@voyage.io');
  const exp = await report(ananya, 'DRAFT');
  const trip = await prisma.travelRequest.findFirst({ where: { requesterId: ananya.id } });
  const line = await prisma.expenseLine.findFirst({ where: { reportId: exp.id } });

  assert.equal(await status(c, 'GET', `/expenses/${exp.id}`), 403);
  const cc = await prisma.costCenter.findFirst({ where: { active: true } });
  assert.equal(await status(c, 'PUT', `/expenses/${exp.id}`, { title: 'Hacked title', purpose: 'Hacked purpose here', costCenterId: cc.id }), 403);
  assert.equal(await status(c, 'DELETE', `/expenses/${exp.id}`), 403);
  assert.equal(await status(c, 'POST', `/expenses/${exp.id}/submit`, {}), 403);
  assert.equal(await status(c, 'POST', `/expenses/${exp.id}/withdraw`), 403);
  assert.equal(await status(c, 'DELETE', `/expenses/${exp.id}/lines/${line.id}`), 403);
  if (trip) {
    assert.equal(await status(c, 'GET', `/travel/${trip.id}`), 403);
    assert.equal(await status(c, 'DELETE', `/travel/${trip.id}`), 403);
  }
  // Untouched.
  assert.equal((await prisma.expenseReport.findUnique({ where: { id: exp.id } })).title, 'Authorization test');

  // Lists never leak, even when asking for everything.
  const list = await (await call(c, 'GET', '/expenses?scope=all&pageSize=100')).json();
  assert.ok(list.items.every((e) => e.employee.id === rahul.id), 'expense list only shows own records');
  const trips = await (await call(c, 'GET', '/travel?scope=all&pageSize=100')).json();
  assert.ok(trips.items.every((t) => (t.requester?.id ?? t.requesterId) === rahul.id), 'travel list only shows own records');
});

test('receipts are only served to people allowed to see the record', async () => {
  const att = await prisma.attachment.findFirst({ where: { expenseLine: { report: { employee: { email: 'ananya@voyage.io' } } } } });
  if (!att) return; // demo data without receipts
  assert.equal((await fetch(`${base}/attachments/${att.id}`)).status, 401, 'no session');
  assert.equal(await status(await login('rahul@voyage.io'), 'GET', `/attachments/${att.id}`), 403, 'another employee');
  const own = await call(await login('ananya@voyage.io'), 'GET', `/attachments/${att.id}`);
  assert.equal(own.status, 200, 'the owner');
  assert.equal(own.headers.get('cache-control'), 'private, no-store');
  assert.ok(own.headers.get('content-security-policy'));
  assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
  await own.arrayBuffer();
  assert.equal(await status(await login('rahul@voyage.io'), 'GET', `/attachments/${encodeURIComponent('../../etc/passwd')}`), 404, 'path tricks find nothing');
});

// ---------------------------------------------------------------- approvals
test('approvers act only on steps assigned or delegated to them, with reasons', async () => {
  const step = await prisma.approvalStep.findFirst({ where: { status: 'PENDING', approver: { email: 'neha@voyage.io' } } });
  if (!step) return;
  const rahul = await login('rahul@voyage.io');
  assert.equal(await status(rahul, 'POST', `/approvals/${step.id}/act`, { action: 'APPROVED' }), 403);
  const bulk = await (await call(rahul, 'POST', '/approvals/bulk-approve', { stepIds: [step.id] })).json();
  assert.equal(bulk.approved, 0);
  const neha = await login('neha@voyage.io');
  assert.equal(await status(neha, 'POST', `/approvals/${step.id}/act`, { action: 'REJECTED' }), 400, 'reject needs a reason');
  assert.equal(await status(neha, 'POST', `/approvals/${step.id}/act`, { action: 'RETURNED', comment: '   ' }), 400, 'return needs a reason');
  assert.equal((await prisma.approvalStep.findUnique({ where: { id: step.id } })).status, 'PENDING');
});

// ---------------------------------------------------------------- roles
test('roles reach only their own areas; the auditor is read-only', async () => {
  const emp = await login('rahul@voyage.io');
  for (const p of ['/finance/queue', '/finance/accounting-exports', '/admin/settings', '/admin/rules', '/audit', '/users', '/compliance/holds']) {
    assert.equal(await status(emp, 'GET', p), 403, `employee -> ${p}`);
  }
  assert.equal(await status(emp, 'PUT', '/admin/settings', { mealsPerDiem: 999999 }), 403);
  assert.equal(await status(emp, 'POST', '/admin/rules', { name: 'x' }), 403);
  const ananya = await user('ananya@voyage.io');
  const admin = await user('admin@utthunga.com');
  assert.equal(await status(emp, 'POST', '/users/delegations', { delegateId: ananya.id, delegatorId: admin.id, startDate: '2026-12-01', endDate: '2026-12-02' }), 403, 'employees cannot delegate for others');

  const aud = await login('auditor@voyage.io');
  assert.equal(await status(aud, 'GET', '/audit'), 200, 'auditor reads the audit log');
  assert.equal(await status(aud, 'PUT', '/admin/settings', { mealsPerDiem: 1 }), 403);
  assert.equal(await status(aud, 'POST', '/compliance/holds', { scope: 'PERIOD', from: '2026-01-01', to: '2026-01-02', reason: 'auditor try' }), 403);

  assert.equal(await status(null, 'GET', '/expenses'), 401, 'no session');
  const forged = await fetch(`${base}/expenses`, { headers: { cookie: 'tr_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' } });
  assert.equal(forged.status, 401, 'unsigned token');
});

test('authorization failures are recorded in the audit trail', async () => {
  const c = await login('rahul@voyage.io');
  const before = await prisma.auditLog.count({ where: { action: 'security.access_denied' } });
  assert.equal(await status(c, 'GET', `/compliance/retention?probe=${tag}`), 403);
  await new Promise((r) => setTimeout(r, 300));
  const last = await prisma.auditLog.findFirst({ where: { action: 'security.access_denied' }, orderBy: { seq: 'desc' } });
  assert.ok((await prisma.auditLog.count({ where: { action: 'security.access_denied' } })) > before);
  assert.equal(last.details.path, '/api/compliance/retention');
});

// ---------------------------------------------------------------- Finance duties
test('Finance cannot review, re-code or pay their own claim', async () => {
  const meera = await user('meera@voyage.io');
  const c = await login('meera@voyage.io');
  const review = await report(meera, 'FINANCE_REVIEW');
  const sched = await report(meera, 'SCHEDULED');
  assert.equal(await status(c, 'POST', `/finance/${review.id}/decide`, { action: 'APPROVE' }), 403);
  assert.equal(await status(c, 'POST', `/finance/${review.id}/recode`, { projectCode: 'SELF' }), 403);
  assert.equal(await status(c, 'POST', `/finance/${sched.id}/payment`, { method: 'UPI', amount: 1000, paidAt: '2026-11-24', reference: 'SELFPAY1' }), 403);
  assert.equal((await prisma.expenseReport.findUnique({ where: { id: sched.id } })).status, 'SCHEDULED');
});

test('policy overrides and changed payment amounts need a reason and are audited with before/after', async () => {
  const rahul = await user('rahul@voyage.io');
  const c = await login('sanjay@voyage.io'); // a Finance colleague
  const r = await report(rahul, 'FINANCE_REVIEW', { total: 2000, flags: [{ code: 'OVER_LIMIT', severity: 'violation', message: 'Over the limit' }] });
  assert.equal(await status(c, 'POST', `/finance/${r.id}/decide`, { action: 'APPROVE' }), 400, 'override without a reason');
  assert.equal(await status(c, 'POST', `/finance/${r.id}/decide`, { action: 'APPROVE', comment: 'Client visit, approved by CFO' }), 200);
  const approved = await prisma.auditLog.findFirst({ where: { action: 'finance.approved', entityId: r.id } });
  assert.equal(approved.details.policyOverride, true);
  assert.deepEqual(approved.details.status, { from: 'FINANCE_REVIEW', to: 'SCHEDULED' });

  const pay = { method: 'BANK_TRANSFER', amount: 1500, paidAt: '2026-11-24', reference: `UTR${tag}` };
  assert.equal(await status(c, 'POST', `/finance/${r.id}/payment`, pay), 400, 'different amount without a reason');
  assert.equal(await status(c, 'POST', `/finance/${r.id}/payment`, { ...pay, adjustmentReason: 'Advance of 500 already paid' }), 200);
  const paid = await prisma.auditLog.findFirst({ where: { action: 'finance.payment_recorded', entityId: r.id } });
  assert.deepEqual(paid.details.amount, { from: 2000, to: 1500 });
  assert.deepEqual(paid.details.status, { from: 'SCHEDULED', to: 'PAID' });
  assert.equal(paid.details.adjustmentReason, 'Advance of 500 already paid');
});

// ---------------------------------------------------------------- input validation
test('unknown currencies and inactive categories are rejected, not converted at rate 1', async () => {
  const c = await login('rahul@voyage.io');
  const rahul = await user('rahul@voyage.io');
  const r = await report(rahul, 'DRAFT');
  const cat = await prisma.expenseCategory.findFirst({ where: { active: true } });
  const line = { date: '2026-11-20', categoryId: cat.id, merchant: 'Somewhere', amount: 1000, currency: 'XYZ', paymentMethod: 'PERSONAL_CARD' };
  const res = await call(c, 'POST', `/expenses/${r.id}/lines`, line);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error.message, /not an accepted currency/);
  assert.equal(await status(c, 'POST', `/expenses/${r.id}/lines`, { ...line, currency: 'INR', categoryId: 'no-such-category' }), 400);
  assert.equal(await prisma.expenseLine.count({ where: { reportId: r.id, merchant: 'Somewhere' } }), 0);
});

// ---------------------------------------------------------------- sessions
test('signing out ends the session on the server, not just in the browser', async () => {
  const c = await login('rahul@voyage.io');
  assert.equal(await status(c, 'GET', '/auth/me'), 200);
  assert.equal(await status(c, 'POST', '/auth/logout'), 200);
  assert.equal(await status(c, 'GET', '/auth/me'), 401, 'the old cookie no longer works');
});

test('an idle session ends; "sign out other devices" ends the others', async () => {
  const a = await login('ananya@voyage.io');
  const b = await login('ananya@voyage.io');
  // Make session A look idle for an hour (limit for employees: 30 minutes).
  const sidA = JSON.parse(Buffer.from(a.split('=')[1].split('.')[1], 'base64url').toString()).sid;
  await prisma.session.update({ where: { id: sidA }, data: { lastSeenAt: new Date(Date.now() - 3600_000) } });
  const idle = await call(a, 'GET', '/auth/me');
  assert.equal(idle.status, 401);
  assert.equal((await idle.json()).error.details.reason, 'IDLE');

  const c = await login('ananya@voyage.io');
  const ended = await (await call(b, 'POST', '/auth/sessions/revoke-others')).json();
  assert.ok(ended.ended >= 1);
  assert.equal(await status(b, 'GET', '/auth/me'), 200, 'this device stays signed in');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await status(c, 'GET', '/auth/me'), 401, 'the other device is signed out');
});

test('a deactivated person loses access at once', async () => {
  const temp = await prisma.user.create({
    data: { email: `leaver.${tag}@utthunga.com`, name: 'Leaving Person', employeeId: `LV${tag}`, role: 'EMPLOYEE', passwordHash: await bcrypt.hash('Leaver#Password1', 10) },
  });
  made.users.push(temp.id);
  const c = await login(temp.email, 'Leaver#Password1');
  assert.equal(await status(c, 'GET', '/auth/me'), 200);
  const admin = await login('admin@utthunga.com', 'admin@123');
  assert.equal(await status(admin, 'PATCH', `/users/${temp.id}`, { active: false }), 200);
  assert.equal(await status(c, 'GET', '/auth/me'), 401);
  assert.equal(await prisma.session.count({ where: { userId: temp.id, revokedAt: null } }), 0, 'all sessions ended');
  const audit = await prisma.auditLog.findFirst({ where: { action: 'user.updated', entityId: temp.id }, orderBy: { seq: 'desc' } });
  assert.deepEqual(audit.details.changed.active, { from: true, to: false });
});

test('Finance and administrator sessions are shorter', async () => {
  const fin = await login('meera@voyage.io');
  const emp = await login('rahul@voyage.io');
  const exp = (cookie) => JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[1], 'base64url').toString()).exp;
  const iat = (cookie) => JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[1], 'base64url').toString()).iat;
  assert.ok(exp(fin) - iat(fin) < exp(emp) - iat(emp));
});

// ---------------------------------------------------------------- audit trail
test('the audit trail cannot be edited or deleted, even by the application', async () => {
  const row = await prisma.auditLog.findFirst({ orderBy: { seq: 'desc' } });
  await assert.rejects(prisma.$executeRaw`UPDATE "AuditLog" SET "action" = 'tampered' WHERE id = ${row.id}`, /append-only/);
  await assert.rejects(prisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${row.id}`, /append-only/);
  assert.equal((await prisma.auditLog.findUnique({ where: { id: row.id } })).action, row.action);
});
