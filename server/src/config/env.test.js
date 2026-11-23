import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionProblems } from './env.js';

const good = {
  JWT_SECRET: 'a'.repeat(64),
  DATABASE_URL: 'postgresql://voyage:Str0ng-Pa55@db.internal:5432/voyage',
  CLIENT_URL: 'https://travel.utthunga.com',
  UPLOAD_DIR: '/var/lib/voyage/uploads',
  SSO_ENABLED: true,
  AZURE_AD_REDIRECT_URI: 'https://travel.utthunga.com/api/auth/sso/callback',
};

test('a correct production configuration passes', () => {
  assert.deepEqual(productionProblems(good), []);
});

test('placeholder secrets, http URLs and relative upload paths are rejected', () => {
  const problems = productionProblems({
    ...good,
    JWT_SECRET: 'replace-with-a-long-random-secret',
    DATABASE_URL: 'postgresql://postgres:change-me@localhost:5432/x',
    CLIENT_URL: 'http://travel.utthunga.com',
    UPLOAD_DIR: 'uploads',
    AZURE_AD_REDIRECT_URI: 'http://localhost:5195/api/auth/sso/callback',
  });
  assert.equal(problems.length, 5);
});
