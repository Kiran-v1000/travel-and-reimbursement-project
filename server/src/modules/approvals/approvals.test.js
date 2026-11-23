import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleMatches } from './approvals.engine.js';

const requester = { id: 'u1', departmentId: 'd-eng' };
const base = { entityType: 'TRAVEL', minAmount: 0, maxAmount: null, departmentId: null, costCenterCode: null, travelType: null, onPolicyException: false };

test('matches by amount threshold band', () => {
  const rule = { ...base, minAmount: 50000, maxAmount: 200000 };
  assert.equal(ruleMatches(rule, { entityType: 'TRAVEL', amount: 49999, requester }), false);
  assert.equal(ruleMatches(rule, { entityType: 'TRAVEL', amount: 50000, requester }), true);
  assert.equal(ruleMatches(rule, { entityType: 'TRAVEL', amount: 200001, requester }), false);
});

test('respects entity type, department and travel type', () => {
  assert.equal(ruleMatches({ ...base, entityType: 'EXPENSE' }, { entityType: 'TRAVEL', amount: 1, requester }), false);
  assert.equal(ruleMatches({ ...base, departmentId: 'd-sales' }, { entityType: 'TRAVEL', amount: 1, requester }), false);
  assert.equal(ruleMatches({ ...base, departmentId: 'd-eng' }, { entityType: 'TRAVEL', amount: 1, requester }), true);
  assert.equal(ruleMatches({ ...base, travelType: 'INTERNATIONAL' }, { entityType: 'TRAVEL', amount: 1, requester, travelType: 'DOMESTIC' }), false);
});

test('exception-only rules apply only to policy exceptions', () => {
  const rule = { ...base, onPolicyException: true };
  assert.equal(ruleMatches(rule, { entityType: 'TRAVEL', amount: 1, requester, hasException: false }), false);
  assert.equal(ruleMatches(rule, { entityType: 'TRAVEL', amount: 1, requester, hasException: true }), true);
});
