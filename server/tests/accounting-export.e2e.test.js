// Accounting export: payments are claimed once, files balance, and re-downloads are identical.
// Needs a seeded database with some paid reimbursements. Run: npm run test:e2e
// Everything this test claims is released again afterwards, so the demo data is unchanged.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { prisma } from '../src/db/pool.js';
import { preview, createExport, download, journalFor } from '../src/modules/finance/finance.export.service.js';

const finance = await prisma.user.findFirst({ where: { role: { in: ['FINANCE', 'ADMIN'] } } });
const created = [];

/** A minimal stand-in for the Express response that collects the streamed body. */
function sink() {
  const chunks = [];
  const res = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  res.headers = {};
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.body = () => Buffer.concat(chunks).toString('utf8');
  return res;
}

after(async () => {
  for (const id of created) {
    await prisma.payment.updateMany({ where: { exportBatchId: id }, data: { exportBatchId: null } });
    await prisma.accountingExport.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

test('journal for one payment always balances, with an adjustment for differences', () => {
  const p = {
    amount: 1000.5,
    report: { lines: [{ baseAmount: 600.25, tax: 0, category: { glAccount: 'Travel - Meals' } }, { baseAmount: 400, tax: 0, category: { glAccount: null } }] },
  };
  const j = journalFor(p, { bankLedger: 'Bank', adjustmentLedger: 'Adj' });
  assert.deepEqual(j.debits.map((d) => d.ledger), ['Travel - Meals', 'Unmapped Expenses']);
  assert.equal(j.adjustment.amount, 0.25);
  assert.equal(j.debits.reduce((a, d) => a + d.amount, 0) + j.adjustment.amount, j.credit);
});

test('an empty period cannot be exported and leaves no batch behind', async () => {
  const before = await prisma.accountingExport.count();
  const p = await preview({ from: '1990-01-01', to: '1990-01-31' });
  assert.equal(p.payments, 0);
  await assert.rejects(createExport(finance, { from: '1990-01-01', to: '1990-01-31', format: 'CSV' }), /no paid reimbursements/);
  assert.equal(await prisma.accountingExport.count(), before);
});

test('rejects a reversed or too-long range', async () => {
  await assert.rejects(preview({ from: '2026-05-01', to: '2026-04-01' }), /on or after/);
  await assert.rejects(preview({ from: '2020-01-01', to: '2026-01-01' }), /at most/);
});

test('export claims every pending payment once; CSV balances; re-download is identical', async (t) => {
  // Use a year-long window ending today so the range rule is respected.
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const pending = await preview({ from, to });
  if (pending.payments === 0) return t.skip('no paid, unexported reimbursements in the last year');

  const batch = await createExport(finance, { from, to, format: 'CSV' });
  created.push(batch.id);
  assert.equal(batch.payments, pending.payments);
  assert.equal(Number(batch.total), pending.total);

  // Nothing left to export for the same period: a second export is refused.
  assert.equal((await preview({ from, to })).payments, 0);
  await assert.rejects(createExport(finance, { from, to, format: 'TALLY' }), /no paid reimbursements/);

  const a = sink();
  await download(finance, batch.id, a);
  const csv = a.body();
  assert.match(a.headers['content-type'], /text\/csv/);
  const rows = csv.replace(/^﻿/, '').trim().split('\r\n').slice(1);
  let debit = 0;
  let credit = 0;
  for (const r of rows) {
    const cells = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, ''));
    debit += Number(cells[3] || 0);
    credit += Number(cells[4] || 0);
  }
  assert.equal(Math.round(debit * 100), Math.round(credit * 100), 'debits equal credits');
  assert.equal(Math.round(credit * 100), Math.round(pending.total * 100), 'credits equal the amount paid');

  const b = sink();
  await download(finance, batch.id, b);
  assert.equal(b.body(), csv, 're-download is byte-identical');
});

test('Tally XML is well-formed and escapes text', async (t) => {
  // Re-use the batch from the previous test by switching its format for the download.
  const id = created[0];
  if (!id) return t.skip('no batch to download');
  await prisma.accountingExport.update({ where: { id }, data: { format: 'TALLY' } });
  const res = sink();
  await download(finance, id, res);
  const body = res.body();
  assert.match(res.headers['content-type'], /xml/);
  assert.ok(body.startsWith('<?xml') && body.trim().endsWith('</ENVELOPE>'));
  assert.equal((body.match(/<VOUCHER /g) || []).length, (await prisma.accountingExport.findUnique({ where: { id } })).payments);
  assert.ok(!/&(?!(lt|gt|amp|apos|quot);)/.test(body), 'every & is escaped');
});
