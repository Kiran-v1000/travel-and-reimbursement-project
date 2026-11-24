/**
 * The user guide engine.
 *
 * Articles are Markdown files in ../content (one task per file), so anyone can edit the guide
 * without touching code. Each starts with a small header:
 *
 *   ---
 *   title: Claim your expenses
 *   summary: Turn your bills into a report and send it for approval.
 *   audience: everyone            (everyone | manager | finance | admin | auditor - comma list)
 *   section: Expenses
 *   order: 10
 *   minutes: 3
 *   keywords: bill, receipt, reimburse
 *   related: receipts, policy-badges
 *   screens: /expenses/new, /expenses/:id   (pages that offer this article as "How does this work?")
 *   popular: true
 *   ---
 *
 * Text can use live values that follow the company's policy settings, e.g. {{leadDaysDomestic}},
 * {{mealsPerDiem}}, {{helpContact}}, and {{categoryTable}} for the category limits table.
 * Links: [Claim your expenses](help:claim-expense) opens another article; [Expenses](/expenses)
 * opens a page in the app.
 */
import { marked } from 'marked';
import { money } from '../../../shared/utils/format.js';

const files = import.meta.glob('../content/*.md', { query: '?raw', import: 'default', eager: true });

const LIST_FIELDS = new Set(['audience', 'keywords', 'related', 'screens']);

function parse(path, raw) {
  const slug = path.split('/').pop().replace(/\.md$/, '');
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      meta[key] = LIST_FIELDS.has(key) ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;
    }
  }
  return {
    slug,
    title: meta.title ?? slug,
    summary: meta.summary ?? '',
    audience: meta.audience?.length ? meta.audience : ['everyone'],
    section: meta.section ?? 'More help',
    order: Number(meta.order ?? 100),
    minutes: Number(meta.minutes ?? 2),
    keywords: meta.keywords ?? [],
    related: meta.related ?? [],
    screens: meta.screens ?? [],
    popular: meta.popular === 'true',
    body: m ? m[2] : raw,
  };
}

export const ARTICLES = Object.entries(files)
  .map(([p, raw]) => parse(p, raw))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export const BY_SLUG = Object.fromEntries(ARTICLES.map((a) => [a.slug, a]));

/** Sections in reading order (the order of their first article). */
export const SECTIONS = [...new Set(ARTICLES.map((a) => a.section))];

export const AUDIENCES = [
  { value: 'mine', label: 'For you' },
  { value: 'everyone', label: 'Everyone' },
  { value: 'manager', label: 'Managers' },
  { value: 'finance', label: 'Finance' },
  { value: 'admin', label: 'Administrators' },
  { value: 'auditor', label: 'Auditors' },
];

/** Which audiences a role belongs to. Administrators see everything. */
export function audiencesFor(role) {
  switch (role) {
    case 'MANAGER': return ['everyone', 'manager'];
    case 'FINANCE': return ['everyone', 'finance'];
    case 'AUDITOR': return ['everyone', 'auditor'];
    case 'ADMIN': return ['everyone', 'manager', 'finance', 'admin', 'auditor'];
    default: return ['everyone'];
  }
}

export const isFor = (article, audiences) => article.audience.some((a) => audiences.includes(a));

/** Articles offered as "How does this work?" on a given page (route pattern match). */
export function articlesForScreen(pathname) {
  const match = (pattern) => {
    const re = new RegExp(`^${pattern.replace(/:[a-z]+/gi, '[^/]+')}$`);
    return re.test(pathname);
  };
  return ARTICLES.filter((a) => a.screens.some(match));
}

/** Simple ranked search over title, keywords, summary and text. */
export function search(query, articles = ARTICLES) {
  const terms = query.toLowerCase().split(/[^a-z0-9₹]+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  return articles
    .map((a) => {
      const title = a.title.toLowerCase();
      const kw = a.keywords.join(' ').toLowerCase();
      const summary = a.summary.toLowerCase();
      const body = a.body.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 6;
        if (kw.includes(t)) score += 4;
        if (summary.includes(t)) score += 2;
        if (body.includes(t)) score += 1;
      }
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Live values from the company's policy settings, with safe fallbacks. */
export function liveValues(ref) {
  const s = ref?.settings ?? {};
  const cur = s.baseCurrency ?? 'INR';
  const m = (n) => (n == null ? '—' : money(n, cur));
  const cats = (ref?.categories ?? []).filter((c) => c.active !== false);
  const minReceipt = cats.length ? Math.min(...cats.map((c) => Number(c.receiptThreshold ?? 0))) : null;
  const table = cats.length
    ? [
        '| Category | Most you can claim per bill | Receipt needed |',
        '|---|---|---|',
        ...cats.map((c) => `| ${c.name} | ${c.perItemLimit ? m(c.perItemLimit) : 'No limit'} | ${Number(c.receiptThreshold) === 0 ? 'Always' : `Above ${m(c.receiptThreshold)}`} |`),
      ].join('\n')
    : '_The category list will appear here once it is set up._';
  return {
    leadDaysDomestic: s.leadDaysDomestic ?? '—',
    leadDaysInternational: s.leadDaysInternational ?? '—',
    maxTripDays: s.maxTripDays ?? '—',
    lodgingCapDomestic: m(s.lodgingCapDomestic),
    lodgingCapInternational: m(s.lodgingCapInternational),
    mealsPerDiem: m(s.mealsPerDiem),
    submissionDeadlineDays: s.submissionDeadlineDays ?? '—',
    estimateTolerancePct: s.estimateTolerancePct ?? '—',
    baseCurrency: cur,
    receiptFrom: minReceipt == null ? 'the amount set for each category' : minReceipt === 0 ? 'any amount for some categories' : m(minReceipt),
    helpContact: s.helpContact || 'your Finance team',
    categoryTable: table,
  };
}

/** Fill {{values}} (escaped, except the generated table) in an article's text. */
export function fill(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (k === 'categoryTable' ? values[k] : k in values ? escapeHtml(values[k]) : `{{${k}}}`));
}

const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const CALLOUT = /^<p>(Tip|Note|Important|Example|You'll need):\s*/i;

const renderer = new marked.Renderer();
renderer.heading = function heading({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  return `<h${depth} id="${slugify(text)}">${text}</h${depth}>\n`;
};
renderer.link = function link({ href, title, tokens }) {
  const text = this.parser.parseInline(tokens);
  const target = href.startsWith('help:') ? `/help/${href.slice(5)}` : href;
  const external = /^https?:\/\//.test(target);
  return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ''}${external ? ' target="_blank" rel="noreferrer"' : ''}>${text}</a>`;
};
renderer.blockquote = function blockquote({ tokens }) {
  const inner = this.parser.parse(tokens);
  const m = inner.match(CALLOUT);
  const kind = m ? m[1].toLowerCase().replace(/[^a-z]/g, '') : 'note';
  const label = m ? m[1] : '';
  const body = m ? inner.replace(CALLOUT, '<p>') : inner;
  return `<aside class="help-callout help-callout-${kind}">${label ? `<p class="help-callout-label">${escapeHtml(label)}</p>` : ''}${body}</aside>\n`;
};
renderer.table = function table(token) {
  const head = token.header.map((c) => `<th scope="col">${this.parser.parseInline(c.tokens)}</th>`).join('');
  const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
  return `<div class="help-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
};

/** Article body as HTML (content is bundled with the app; live values are escaped). */
export function renderArticle(article, values) {
  return marked.parse(fill(article.body, values), { renderer, gfm: true, async: false });
}
