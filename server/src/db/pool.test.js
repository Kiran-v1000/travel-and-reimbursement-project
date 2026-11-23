import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTransientDbError } from './pool.js';

test('connection failures are treated as transient, real query errors are not', () => {
  assert.equal(isTransientDbError({ code: 'P1001' }), true);
  assert.equal(isTransientDbError({ code: 'P2024' }), true);
  assert.equal(isTransientDbError({ message: "Can't reach database server at `127.0.0.1:5432`" }), true);
  assert.equal(isTransientDbError({ code: 'P2002' }), false); // unique constraint - a real error
  assert.equal(isTransientDbError(new Error('boom')), false);
});
