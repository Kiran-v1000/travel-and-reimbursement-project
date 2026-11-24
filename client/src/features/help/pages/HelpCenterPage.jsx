import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Download, Map, PlayCircle, Plane, Receipt, Search, Clock, Inbox, Landmark, Settings2, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../../app/store.js';
import { PageHeader, Segmented, EmptyState } from '../../../shared/components/ui/primitives.jsx';
import { list, item } from '../../../shared/lib/motion.js';
import { ARTICLES, AUDIENCES, BY_SLUG, SECTIONS, isFor, search } from '../lib/help.js';
import { useMyArticles } from '../hooks/useHelp.js';
import { HelpFeedbackSummary } from '../components/HelpFeedbackSummary.jsx';

const START = [
  { slug: 'how-voyage-works', icon: Map },
  { slug: 'request-trip', icon: Plane },
  { slug: 'claim-expense', icon: Receipt },
  { slug: 'track-request', icon: Clock },
];
const ROLE_START = { MANAGER: 'approve-requests', FINANCE: 'finance-review', ADMIN: 'admin-rules', AUDITOR: 'audit-trail' };
const ROLE_ICON = { MANAGER: Inbox, FINANCE: Landmark, ADMIN: Settings2, AUDITOR: BookOpen };

export function HelpCenterPage() {
  const user = useAppStore((s) => s.user);
  const setTour = useAppStore((s) => s.setTour);
  const { audiences, mine } = useMyArticles();
  const [q, setQ] = useState('');
  const [aud, setAud] = useState('mine');

  const pool = useMemo(() => (aud === 'mine' ? mine : ARTICLES.filter((a) => isFor(a, [aud]))), [aud, mine]);
  const results = useMemo(() => (q.trim() ? search(q, ARTICLES) : null), [q]);
  const popular = mine.filter((a) => a.popular).slice(0, 6);
  const starts = [...START, ...(ROLE_START[user?.role] ? [{ slug: ROLE_START[user.role], icon: ROLE_ICON[user.role] }] : [])];
  const audienceOptions = AUDIENCES.filter((a) => a.value === 'mine' || a.value === 'everyone' || audiences.includes(a.value) || user?.role === 'ADMIN');

  return (
    <div>
      <PageHeader
        kicker="Help"
        title={`How can we help${user?.name ? `, ${user.name.split(' ')[0]}` : ''}?`}
        description="Short, step-by-step answers in plain words. Most take two minutes."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setTour(true)}><PlayCircle className="h-4 w-4" aria-hidden /> Take the tour</button>
            <Link to="/help/guide" className="btn-secondary"><Download className="h-4 w-4" aria-hidden /> Printable guide</Link>
          </>
        }
      />

      <div className="relative mb-6 max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          className="input h-12 rounded-2xl pl-12 text-[15px]"
          placeholder="Ask a question, e.g. how do I claim a taxi ride?"
          aria-label="Search help"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {results ? (
        <section aria-live="polite" aria-label="Search results">
          <p className="mb-3 text-[13px] text-muted">{results.length ? `${results.length} article${results.length === 1 ? '' : 's'} match “${q.trim()}”` : ''}</p>
          {results.length ? (
            <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-surface">
              {results.map((a) => (
                <li key={a.slug}>
                  <Link to={`/help/${a.slug}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-subtle/60">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{a.title}</span>
                      <span className="block text-[12.5px] text-muted">{a.summary}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={HelpCircle} title="No article matches that yet" body="Try other words, or browse the topics below. The FAQ answers the most common questions." action={<Link to="/help/faq" className="btn-secondary">Open the FAQ</Link>} />
          )}
        </section>
      ) : (
        <motion.div variants={list} initial="initial" animate="animate" className="space-y-8">
          <section aria-labelledby="start-title">
            <h2 id="start-title" className="mb-3 text-[15px] font-semibold">Start here</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {starts.map(({ slug, icon: Icon }) => {
                const a = BY_SLUG[slug];
                if (!a) return null;
                return (
                  <motion.li key={slug} variants={item}>
                    <Link to={`/help/${slug}`} className="card group flex h-full flex-col gap-2 p-4 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-brand/40">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon className="h-5 w-5" aria-hidden /></span>
                      <span className="text-[14px] font-semibold">{a.title}</span>
                      <span className="text-[12.5px] text-muted">{a.summary}</span>
                      <span className="mt-auto text-[12px] text-muted">{a.minutes} min read</span>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          </section>

          {popular.length > 0 && (
            <section aria-labelledby="popular-title">
              <h2 id="popular-title" className="mb-3 text-[15px] font-semibold">Popular questions</h2>
              <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-surface">
                {popular.map((a) => (
                  <li key={a.slug}>
                    <Link to={`/help/${a.slug}`} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle/60">
                      <span className="flex-1 text-[13.5px]">{a.title}</span>
                      <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="topics-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="topics-title" className="text-[15px] font-semibold">All topics</h2>
              <Segmented options={audienceOptions.map((o) => ({ value: o.value, label: o.label }))} value={aud} onChange={setAud} />
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {SECTIONS.map((section) => {
                const items = pool.filter((a) => a.section === section);
                if (!items.length) return null;
                return (
                  <div key={section} className="card p-4">
                    <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{section}</h3>
                    <ul className="space-y-0.5">
                      {items.map((a) => (
                        <li key={a.slug}>
                          <Link to={`/help/${a.slug}`} className={clsx('flex min-h-8 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13.5px] transition-colors hover:bg-subtle')}>
                            <span>{a.title}</span>
                            <span className="shrink-0 text-[11.5px] text-muted">{a.minutes} min</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          {user?.role === 'ADMIN' && <HelpFeedbackSummary />}
        </motion.div>
      )}
    </div>
  );
}
