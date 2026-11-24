/**
 * Accounting export of paid reimbursements.
 *
 * Every export is a batch: the paid, not-yet-exported payments in the date range are claimed
 * atomically (UPDATE ... WHERE exportBatchId IS NULL), so a payment is never booked twice - even
 * when two people export at the same time. Past batches can be downloaded again, identically.
 *
 * Formats
 *  - CSV journal: one debit row per expense line (to the category's ledger) and one credit row per
 *    payment (to the bank ledger), plus an adjustment row if the amount paid differs from the claim.
 *  - Tally XML: one Payment voucher per reimbursement with ledger entries grouped by ledger,
 *    ready for Tally's "Import Data → Vouchers".
 * Files are streamed in pages, so 100k payments do not need to fit in memory.
 */
import { prisma } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../shared/errors/AppError.js';
import { csvCell, getSettings, num, round2 } from '../../shared/utils/index.js';
import { audit } from '../audit/audit.service.js';

const PAGE = 1000;
const UNMAPPED = 'Unmapped Expenses';

function range({ from, to }) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw badRequest('Choose a valid date range');
  end.setUTCHours(23, 59, 59, 999);
  if (end < start) throw badRequest('The end date must be on or after the start date');
  if (end - start > 400 * 86400000) throw badRequest('Export at most about a year at a time');
  return { start, end };
}

const pendingWhere = (start, end) => ({ status: 'PAID', paidAt: { gte: start, lte: end }, exportBatchId: null });

/** How many paid, not-yet-exported reimbursements fall in the range (no changes made). */
export async function preview(q) {
  const { start, end } = range(q);
  const where = pendingWhere(start, end);
  const [agg, lines, unmapped] = await Promise.all([
    prisma.payment.aggregate({ where, _count: true, _sum: { amount: true } }),
    prisma.expenseLine.count({ where: { report: { payment: where } } }),
    prisma.expenseLine.count({ where: { report: { payment: where }, category: { glAccount: null } } }),
  ]);
  const alreadyExported = await prisma.payment.count({ where: { status: 'PAID', paidAt: { gte: start, lte: end }, exportBatchId: { not: null } } });
  return { payments: agg._count, lines, total: num(agg._sum.amount), alreadyExported, unmappedLines: unmapped };
}

/** Claim the pending payments into a new batch. Returns the batch. */
export async function createExport(user, { from, to, format }) {
  const { start, end } = range({ from, to });
  if (!['CSV', 'TALLY'].includes(format)) throw badRequest('Unknown export format');
  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.accountingExport.create({ data: { format, fromDate: start, toDate: end, createdById: user.id } });
    const claimed = await tx.payment.updateMany({ where: pendingWhere(start, end), data: { exportBatchId: created.id } });
    if (claimed.count === 0) throw conflict('There are no paid reimbursements left to export in this period.');
    const [agg, lines] = await Promise.all([
      tx.payment.aggregate({ where: { exportBatchId: created.id }, _sum: { amount: true } }),
      tx.expenseLine.count({ where: { report: { payment: { exportBatchId: created.id } } } }),
    ]);
    return tx.accountingExport.update({ where: { id: created.id }, data: { payments: claimed.count, lines, total: agg._sum.amount ?? 0 } });
  });
  await audit(user, 'finance.accounting_exported', 'EXPORT', batch.id, {
    format, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), payments: batch.payments, total: num(batch.total),
  });
  return batch;
}

export const history = () =>
  prisma.accountingExport.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { createdBy: { select: { name: true } } } });

/** Page through a batch's payments with everything the journal needs. */
async function* batchPayments(batchId) {
  let cursor;
  for (;;) {
    const page = await prisma.payment.findMany({
      where: { exportBatchId: batchId },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        report: {
          select: {
            code: true, title: true, projectCode: true,
            employee: { select: { employeeId: true, name: true } },
            costCenter: { select: { code: true } },
            lines: { orderBy: { date: 'asc' }, select: { date: true, merchant: true, description: true, baseAmount: true, tax: true, category: { select: { name: true, glAccount: true } } } },
          },
        },
      },
    });
    if (!page.length) return;
    yield page;
    cursor = page[page.length - 1].id;
  }
}

const day = (d) => new Date(d).toISOString().slice(0, 10);
const money = (n) => round2(n).toFixed(2);

/** Debit lines + credit + (optional) adjustment for one payment. Always balances. */
export function journalFor(p, { bankLedger, adjustmentLedger }) {
  const r = p.report;
  const debits = r.lines.map((l) => ({ ledger: l.category.glAccount || UNMAPPED, amount: round2(num(l.baseAmount)), tax: round2(num(l.tax)), line: l }));
  const debitTotal = round2(debits.reduce((a, d) => a + d.amount, 0));
  const paid = round2(num(p.amount));
  const diff = round2(paid - debitTotal);
  return { debits, credit: paid, adjustment: diff ? { ledger: adjustmentLedger, amount: diff } : null, bankLedger };
}

const CSV_HEADER = ['Date', 'Voucher', 'Ledger', 'Debit', 'Credit', 'Narration', 'Employee ID', 'Employee', 'Cost center', 'Project', 'Category', 'Tax', 'Payment method', 'Reference (UTR)', 'Batch'];

async function writeCsv(batch, res, ledgers) {
  res.write('﻿' + CSV_HEADER.map(csvCell).join(',') + '\r\n'); // BOM so Excel opens UTF-8 (₹) correctly
  for await (const page of batchPayments(batch.id)) {
    let out = '';
    for (const p of page) {
      const r = p.report;
      const j = journalFor(p, ledgers);
      const common = [r.employee.employeeId, r.employee.name, r.costCenter?.code ?? '', r.projectCode ?? ''];
      const row = (cells) => (out += cells.map(csvCell).join(',') + '\r\n');
      for (const d of j.debits) {
        row([day(p.paidAt), r.code, d.ledger, money(d.amount), '', `${d.line.merchant}${d.line.description ? ` - ${d.line.description}` : ''}`, ...common, d.line.category.name, money(d.tax), p.method, p.reference ?? '', batch.id]);
      }
      if (j.adjustment) {
        const a = j.adjustment;
        row([day(p.paidAt), r.code, a.ledger, a.amount > 0 ? money(a.amount) : '', a.amount < 0 ? money(-a.amount) : '', 'Difference between amount paid and amount claimed', ...common, '', '', p.method, p.reference ?? '', batch.id]);
      }
      row([day(p.paidAt), r.code, j.bankLedger, '', money(j.credit), `Reimbursement ${r.code} to ${r.employee.name}`, ...common, '', '', p.method, p.reference ?? '', batch.id]);
    }
    res.write(out);
  }
}

const xml = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

async function writeTally(batch, res, ledgers) {
  res.write('<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n <BODY><IMPORTDATA>\n  <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>\n  <REQUESTDATA>\n');
  for await (const page of batchPayments(batch.id)) {
    let out = '';
    for (const p of page) {
      const r = p.report;
      const j = journalFor(p, ledgers);
      // Group debits by ledger - Tally wants one entry per ledger per voucher.
      const byLedger = new Map();
      for (const d of j.debits) byLedger.set(d.ledger, round2((byLedger.get(d.ledger) ?? 0) + d.amount));
      if (j.adjustment) byLedger.set(j.adjustment.ledger, round2((byLedger.get(j.adjustment.ledger) ?? 0) + j.adjustment.amount));
      const entries = [...byLedger].map(([ledger, amt]) =>
        // Tally: debits are negative amounts with ISDEEMEDPOSITIVE=Yes.
        `     <ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${amt >= 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${money(-amt)}</AMOUNT></ALLLEDGERENTRIES.LIST>\n`).join('');
      out +=
        `   <TALLYMESSAGE xmlns:UDF="TallyUDF">\n    <VOUCHER VCHTYPE="Payment" ACTION="Create">\n` +
        `     <DATE>${day(p.paidAt).replace(/-/g, '')}</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(r.code)}</VOUCHERNUMBER>\n` +
        `     <REFERENCE>${xml(p.reference)}</REFERENCE>\n` +
        `     <NARRATION>${xml(`Reimbursement ${r.code} - ${r.employee.name} (${r.employee.employeeId}) - ${r.title}${r.costCenter ? ` - CC ${r.costCenter.code}` : ''}${r.projectCode ? ` - ${r.projectCode}` : ''}`)}</NARRATION>\n` +
        entries +
        `     <ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(j.bankLedger)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${money(j.credit)}</AMOUNT></ALLLEDGERENTRIES.LIST>\n` +
        `    </VOUCHER>\n   </TALLYMESSAGE>\n`;
    }
    res.write(out);
  }
  res.write('  </REQUESTDATA>\n </IMPORTDATA></BODY>\n</ENVELOPE>\n');
}

/** Stream a batch file (first download or any later re-download - identical content). */
export async function download(user, batchId, res) {
  const batch = await prisma.accountingExport.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Export');
  const s = await getSettings();
  const ledgers = { bankLedger: s.accountingBankLedger || 'Bank Account', adjustmentLedger: s.accountingAdjustmentLedger || 'Reimbursement Adjustments' };
  const stamp = `${day(batch.fromDate)}_to_${day(batch.toDate)}`;
  const tally = batch.format === 'TALLY';
  // Record the download before any data leaves; refuse it if the audit entry cannot be written.
  await audit(user, 'finance.accounting_downloaded', 'EXPORT', batch.id, { format: batch.format, payments: batch.payments }, { strict: true });
  res.setHeader('Content-Type', tally ? 'application/xml; charset=utf-8' : 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="voyage-reimbursements_${stamp}${tally ? '_tally.xml' : '_journal.csv'}"`);
  try {
    await (tally ? writeTally(batch, res, ledgers) : writeCsv(batch, res, ledgers));
  } catch (err) {
    // Headers are already sent: abort the connection so the browser shows a failed download
    // instead of saving a silently truncated file.
    res.destroy(err);
    throw err;
  }
  res.end();
}
