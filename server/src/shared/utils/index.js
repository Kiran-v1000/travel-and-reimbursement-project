import crypto from 'node:crypto';
import { prisma } from '../../db/pool.js';

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const num = (d) => (d == null ? 0 : Number(d));

/** Generate human friendly sequential codes, e.g. TR-2026-0007. */
export async function nextCode(prefix, tx = prisma) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(row.value).padStart(4, '0')}`;
}

export async function getSetting(key, fallback) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Convert an amount to the base currency using the configured rate table. */
export async function toBase(amount, currency) {
  const base = await getSetting('baseCurrency', 'INR');
  if (!currency || currency === base) return { rate: 1, base: round2(amount), date: new Date() };
  const cur = await prisma.currency.findUnique({ where: { code: currency } });
  const rate = cur ? Number(cur.rateToBase) : 1;
  return { rate, base: round2(Number(amount) * rate), date: cur?.updatedAt ?? new Date() };
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

/** Parse common list query params. */
export function paging(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 25));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','));
  return [head, ...body].join('\n');
}
