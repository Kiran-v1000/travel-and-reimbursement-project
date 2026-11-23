import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round2, toCsv, daysBetween } from './index.js';

test('round2 rounds money to two decimals', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(10), 10);
});

test('toCsv escapes quotes, commas and spreadsheet formulas', () => {
  const csv = toCsv([{ a: 'x,"y"', b: '=SUM(A1)' }], [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]);
  assert.equal(csv, 'A,B\n"x,""y""",\'=SUM(A1)');
});

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-08'), 7);
});
