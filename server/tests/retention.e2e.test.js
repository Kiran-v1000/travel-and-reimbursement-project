// Data retention + legal hold. Creates backdated records, purges them, and checks that held
// records survive and cannot be changed. Needs a seeded database. Run: npm run test:e2e
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db/pool.js';
import { uploadDir } from '../src/modules/attachments/attachments.service.js';
import * as holds from '../src/modules/compliance/compliance.holds.service.js';
import * as retention from '../src/modules/compliance/compliance.retention.service.js';
import * as expenses from '../src/modules/expenses/expenses.service.js';

const tag = Date.now();
const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
// The oldest seeded employee - other test files create and delete temporary people in parallel.
const employee = await prisma.user.findFirst({ where: { role: 'EMPLOYEE', active: true }, orderBy: { createdAt: 'asc' } });
const category = await prisma.expenseCategory.findFirst({ where: { glAccount: { not: null } } });
const OLD = new Date('2010-03-15T10:00:00Z');
const made = { reports: [], trips: [], holds: [], runs: [] };

async function oldReport(n) {
  const r = await prisma.expenseReport.create({
    data: {
      code: `RT-${tag}-${n}`, employeeId: employee.id, title: `Old claim ${n}`, purpose: 'Client visit with private notes', status: 'REJECTED',
      financeNote: 'note', totalBase: 1200,
      lines: { create: [{ date: OLD, categoryId: category.id, merchant: 'Secret Hotel', description: 'room 204', amount: 1200, baseAmount: 1200 }] },
    },
    include: { lines: true },
  });
  const storedName = `retention-test-${tag}-${n}.pdf`;
  fs.writeFileSync(path.join(uploadDir, storedName), '%PDF-1.4\n%%EOF\n');
  await prisma.attachment.create({ data: { originalName: 'receipt.pdf', storedName, mimeType: 'application/pdf', size: 15, uploadedById: employee.id, expenseLineId: r.lines[0].id } });
  // Backdate (updatedAt is maintained by Prisma, so set it with SQL).
  await prisma.$executeRaw`UPDATE "ExpenseReport" SET "createdAt" = ${OLD}, "updatedAt" = ${OLD} WHERE id = ${r.id}`;
  made.reports.push(r.id);
  return { ...r, storedName };
}

after(async () => {
  await prisma.legalHold.deleteMany({ where: { id: { in: made.holds } } });
  await prisma.attachment.deleteMany({ where: { expenseLine: { reportId: { in: made.reports } } } });
  await prisma.expenseReport.deleteMany({ where: { id: { in: made.reports } } });
  await prisma.retentionRun.deleteMany({ where: { id: { in: made.runs } } });
  for (const f of fs.readdirSync(uploadDir).filter((f) => f.startsWith(`retention-test-${tag}`))) fs.rmSync(path.join(uploadDir, f));
  await prisma.$disconnect();
});

test('cutoff is the retention period before now', () => {
  assert.equal(retention.cutoffFor(8, new Date('2026-11-23T00:00:00Z')).toISOString(), '2018-11-23T00:00:00.000Z');
});

test('held records survive a purge and cannot be changed; the rest are purged', async () => {
  const free = await oldReport(1);
  const kept = await oldReport(2);
  const hold = await holds.place(admin, { scope: 'EXPENSE', code: kept.code, reason: 'GST audit FY2010', reference: 'AUD-1' });
  made.holds.push(hold.id);

  // The hold shows on the record and blocks the owner's changes.
  assert.equal((await holds.holdsFor('EXPENSE', await prisma.expenseReport.findUnique({ where: { id: kept.id } }))).length, 1);
  await assert.rejects(expenses.update(employee, kept.id, { title: 'changed' }), /legal hold/);
  await assert.rejects(holds.place(admin, { scope: 'EXPENSE', code: kept.code, reason: 'duplicate hold' }), /identical hold/);

  const before = await retention.preview();
  assert.ok(before.expenses.records >= 1);
  assert.ok(before.expenses.held >= 1);

  const run = await retention.start({ trigger: 'MANUAL', user: admin, wait: true });
  made.runs.push(run.id);
  assert.equal(run.status, 'DONE');
  assert.ok(run.expenses >= 1 && run.files >= 1);

  const purged = await prisma.expenseReport.findUnique({ where: { id: free.id }, include: { lines: { include: { attachments: true } } } });
  assert.ok(purged.purgedAt, 'free record purged');
  assert.equal(purged.title, 'Purged record');
  assert.equal(purged.purpose, '');
  assert.equal(purged.financeNote, null);
  assert.equal(purged.lines[0].merchant, 'Purged record');
  assert.equal(purged.lines[0].description, null);
  assert.equal(purged.lines[0].attachments.length, 0);
  assert.equal(Number(purged.totalBase), 1200, 'amounts are kept');
  assert.equal(Number(purged.lines[0].baseAmount), 1200);
  assert.equal(fs.existsSync(path.join(uploadDir, free.storedName)), false, 'receipt file deleted');
  await assert.rejects(expenses.update(employee, free.id, { title: 'x' }), /archived under the retention policy/);

  const survivor = await prisma.expenseReport.findUnique({ where: { id: kept.id }, include: { lines: { include: { attachments: true } } } });
  assert.equal(survivor.purgedAt, null, 'held record not purged');
  assert.equal(survivor.title, 'Old claim 2');
  assert.equal(survivor.lines[0].attachments.length, 1);
  assert.equal(fs.existsSync(path.join(uploadDir, kept.storedName)), true);

  // Release the hold: the record becomes eligible again on the next run.
  await holds.release(admin, hold.id, { reason: 'Audit closed' });
  await assert.rejects(holds.release(admin, hold.id, { reason: 'again please' }), /already released/);
  const run2 = await retention.start({ trigger: 'MANUAL', user: admin, wait: true });
  made.runs.push(run2.id);
  assert.ok((await prisma.expenseReport.findUnique({ where: { id: kept.id } })).purgedAt, 'purged after release');
});

test('an employee hold covers their older records but not new ones', async () => {
  const old = await oldReport(3);
  const hold = await holds.place(admin, { scope: 'EMPLOYEE', userId: employee.id, reason: 'Dispute review' });
  made.holds.push(hold.id);
  assert.equal((await holds.holdsFor('EXPENSE', await prisma.expenseReport.findUnique({ where: { id: old.id } }))).length, 1);
  const fresh = await prisma.expenseReport.create({ data: { code: `RT-${tag}-new`, employeeId: employee.id, title: 'New claim', purpose: 'x' } });
  made.reports.push(fresh.id);
  assert.equal((await holds.holdsFor('EXPENSE', fresh)).length, 0, 'records created after the hold are not frozen');
  await holds.release(admin, hold.id, { reason: 'Dispute settled' });
});

test('only one run at a time', async () => {
  const blocker = await prisma.retentionRun.create({ data: { trigger: 'MANUAL', cutoff: new Date() } });
  made.runs.push(blocker.id);
  await assert.rejects(retention.start({ trigger: 'MANUAL', user: admin }), /already in progress/);
  assert.equal(await retention.start({ trigger: 'SCHEDULED' }), null, 'scheduled run quietly skips');
  await prisma.retentionRun.update({ where: { id: blocker.id }, data: { status: 'DONE' } });
});
