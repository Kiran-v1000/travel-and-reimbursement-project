#!/usr/bin/env node
/**
 * Checks the user guide (src/features/help/content/*.md) so a mistake fails CI instead of
 * reaching employees:
 *   - every article has a title, summary and section, and known audiences
 *   - "related" articles, [text](help:slug) links and flow-map steps point at real articles
 *   - {{placeholders}} are ones the guide engine fills in
 *   - links into the app point at a page that exists
 * Run: npm run check:help
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const contentDir = join(root, 'features', 'help', 'content');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const AUDIENCES = new Set(['everyone', 'manager', 'finance', 'admin', 'auditor']);
const LIST = new Set(['audience', 'keywords', 'related', 'screens']);
const REQUIRED = ['title', 'summary', 'section'];

// Placeholders the engine fills (see liveValues in lib/help.js).
const engine = read(join(root, 'features', 'help', 'lib', 'help.js'));
const live = engine.slice(engine.indexOf('export function liveValues'));
const PLACEHOLDERS = new Set([...live.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]));

// Top-level pages in the app router, e.g. "expenses" from <Route path="expenses/:id" ...>.
const router = read(join(root, 'app', 'router.jsx'));
const PAGES = new Set([...router.matchAll(/path="([^"]+)"/g)].map((m) => m[1].replace(/^\//, '').split('/')[0]));

const articles = new Map();
for (const file of readdirSync(contentDir).filter((f) => f.endsWith('.md'))) {
  const slug = file.replace(/\.md$/, '');
  const raw = read(join(contentDir, file));
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      meta[k] = LIST.has(k) ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;
    }
  }
  articles.set(slug, { file, meta, body: m ? m[2] : raw, hasHeader: !!m });
}

const problems = [];
const bad = (file, msg) => problems.push(`${file}: ${msg}`);

for (const [slug, { file, meta, body, hasHeader }] of articles) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) bad(file, 'file name must be lowercase words and dashes');
  if (!hasHeader) { bad(file, 'missing the --- header block'); continue; }
  for (const k of REQUIRED) if (!meta[k]) bad(file, `missing "${k}"`);
  for (const a of meta.audience ?? []) if (!AUDIENCES.has(a)) bad(file, `unknown audience "${a}"`);
  for (const k of ['order', 'minutes']) if (meta[k] != null && !Number.isFinite(Number(meta[k]))) bad(file, `"${k}" must be a number`);
  for (const r of meta.related ?? []) if (!articles.has(r)) bad(file, `related article "${r}" does not exist`);
  for (const s of meta.screens ?? []) {
    const page = s.slice(1).split('/')[0];
    if (!s.startsWith('/') || (page && !PAGES.has(page))) bad(file, `screen "${s}" is not a page in the app`); // "/" is the dashboard
  }
  for (const [, p] of body.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)) if (!PLACEHOLDERS.has(p)) bad(file, `unknown placeholder {{${p}}}`);
  for (const [, target] of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (target.startsWith('help:')) {
      if (!articles.has(target.slice(5).split('#')[0])) bad(file, `link to missing article "${target}"`);
    } else if (target.startsWith('/')) {
      const page = target.slice(1).split(/[/?#]/)[0];
      if (page && !PAGES.has(page)) bad(file, `link to unknown page "${target}"`);
    }
  }
}

// Every step on the flow map opens an article.
const flow = read(join(root, 'features', 'help', 'components', 'FlowMap.jsx'));
for (const [, s] of flow.matchAll(/slug: '([^']+)'/g)) if (!articles.has(s)) bad('FlowMap.jsx', `step opens missing article "${s}"`);

// "How does this work?" links on pages name real articles.
const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.jsx') ? [join(dir, d.name)] : []));
for (const f of walk(root)) {
  for (const m of read(f).matchAll(/<HelpLink[^>]*?slug=(\{[^}]*\}|"[^"]*")/g)) {
    for (const [, s] of m[1].matchAll(/['"]([a-z0-9-]+)['"]/g)) {
      if (!articles.has(s)) bad(f.slice(root.length + 1), `HelpLink opens missing article "${s}"`);
    }
  }
}

if (problems.length) {
  console.error(`User guide check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`User guide OK: ${articles.size} articles, ${PLACEHOLDERS.size} live values, links checked.`);
