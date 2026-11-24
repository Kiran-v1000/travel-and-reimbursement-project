/**
 * Runs `node --test` on every *.test.js file under the given folders.
 * Works on all supported Node versions (glob patterns for --test only exist from Node 21).
 *
 *   node scripts/run-tests.js src      # unit tests (next to the code)
 *   node scripts/run-tests.js --db tests   # integration tests, on the separate test database
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareTestDatabase } from './test-db.js';

const useDb = process.argv.includes('--db');
const roots = process.argv.slice(2).filter((a) => a !== '--db');
if (!roots.length) {
  console.error('usage: node scripts/run-tests.js <folder> [folder...]');
  process.exit(2);
}

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.test.js')) files.push(full);
  }
};
roots.forEach(walk);
files.sort();

if (!files.length) {
  console.error(`No *.test.js files found under: ${roots.join(', ')}`);
  process.exit(1);
}

// Integration tests (--db) run against their own database (see scripts/test-db.js), which is
// created, migrated and seeded first - never the database you work or demo with.
let env = process.env;
if (useDb) {
  try {
    env = prepareTestDatabase();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
