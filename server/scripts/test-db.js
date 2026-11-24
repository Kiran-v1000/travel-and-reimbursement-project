/**
 * The database the integration tests use - never the one you work or demo with.
 *
 *   TEST_DATABASE_URL (if set)            -> used as is
 *   otherwise DATABASE_URL (env or .env)  -> same server, database name + "_test"
 *                                            (a name already ending in _test / _ci is kept: CI)
 *
 * Safety: refuses any database whose name does not end in _test or _ci, so a test run can
 * never write into a demo or production database by mistake.
 *
 *   node scripts/test-db.js prepare   create (if needed), migrate, seed if empty
 *   node scripts/test-db.js reset     drop and rebuild it from scratch, then seed
 */
import 'dotenv/config';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_NAME = /_(test|ci)$/;

export function testDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error('Set DATABASE_URL (in server/.env) or TEST_DATABASE_URL.');
  const url = new URL(raw);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!process.env.TEST_DATABASE_URL && !TEST_NAME.test(name)) url.pathname = `/${name}_test`;
  const finalName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!TEST_NAME.test(finalName)) {
    throw new Error(`Refusing to run tests against "${finalName}": the test database name must end in _test or _ci.`);
  }
  return { url: url.toString(), name: finalName };
}

/**
 * Environment for anything that should touch only the test database and test uploads.
 * Uploads: TEST_UPLOAD_DIR if set; in CI (CI=true, a disposable machine) the job's own UPLOAD_DIR,
 * so the separate "seed" step and the tests use the same folder; on a developer machine
 * uploads-test/, so test receipts never mix with your working ones.
 */
export function testEnv() {
  const { url } = testDatabaseUrl();
  const uploads = process.env.TEST_UPLOAD_DIR || (process.env.CI && process.env.UPLOAD_DIR) || 'uploads-test';
  return { ...process.env, DATABASE_URL: url, UPLOAD_DIR: uploads, NODE_ENV: 'test' };
}

function run(cmd, args, env) {
  // npx is a .cmd shim on Windows and needs a shell; node itself must not go through one
  // (its path, e.g. "C:\Program Files\nodejs\node.exe", contains a space).
  const r = spawnSync(cmd, args, { cwd: serverDir, env, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Create (Prisma creates a missing database), apply every migration, seed demo data if empty. */
export function prepareTestDatabase() {
  const env = testEnv();
  console.log(`[tests] using database "${testDatabaseUrl().name}" (your working database is not touched)`);
  run('npx', ['prisma', 'migrate', 'deploy'], env);
  run(process.execPath, ['src/db/seeds/seed.js'], env); // skips when the database already has people
  return env;
}

export function resetTestDatabase() {
  const env = testEnv();
  console.log(`[tests] resetting database "${testDatabaseUrl().name}"`);
  run('npx', ['prisma', 'migrate', 'reset', '--force'], env); // drops, migrates, seeds
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cmd = process.argv[2];
  try {
    if (cmd === 'prepare') prepareTestDatabase();
    else if (cmd === 'reset') resetTestDatabase();
    else if (cmd === 'url') console.log(testDatabaseUrl().name);
    else {
      console.error('usage: node scripts/test-db.js prepare|reset|url');
      process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
