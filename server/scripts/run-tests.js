/**
 * Runs `node --test` on every *.test.js file under the given folders.
 * Works on all supported Node versions (glob patterns for --test only exist from Node 21).
 *
 *   node scripts/run-tests.js src      # unit tests (next to the code)
 *   node scripts/run-tests.js tests    # integration tests (need a seeded database)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = process.argv.slice(2);
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

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
