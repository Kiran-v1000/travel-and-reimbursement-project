import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaims } from './auth.sso.service.js';

const opts = { tenantId: 'tenant-1', allowedDomains: ['utthunga.com'], nonce: 'n1' };
const good = { tid: 'tenant-1', oid: 'oid-1', nonce: 'n1', preferred_username: 'Kiran.V@Utthunga.com', name: 'Kiran V' };

test('accepts an @utthunga.com account from the company tenant', () => {
  assert.deepEqual(verifyClaims(good, opts), { email: 'kiran.v@utthunga.com', oid: 'oid-1', name: 'Kiran V' });
});

test('rejects other email domains', () => {
  assert.throws(() => verifyClaims({ ...good, preferred_username: 'someone@gmail.com' }, opts), /Only @utthunga\.com/);
});

test('rejects accounts from another tenant', () => {
  assert.throws(() => verifyClaims({ ...good, tid: 'other' }, opts), /different organisation/);
});

test('rejects a nonce mismatch', () => {
  assert.throws(() => verifyClaims({ ...good, nonce: 'x' }, opts), /nonce/);
});
