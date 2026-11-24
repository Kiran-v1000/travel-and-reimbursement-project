import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAppStore } from '../../../app/store.js';
import { Segmented } from '../../../shared/components/ui/primitives.jsx';
import { ARTICLES, AUDIENCES, SECTIONS, isFor } from '../lib/help.js';
import { useMyArticles } from '../hooks/useHelp.js';
import { ArticleBody } from '../components/ArticleBody.jsx';
import { FlowMap } from '../components/FlowMap.jsx';

/**
 * The whole user guide on one page, for printing or "Save as PDF" (HR onboarding, offline use).
 * Built from the same articles as the Help Center, so the two never disagree.
 */
export function HelpGuidePage() {
  const user = useAppStore((s) => s.user);
  const { mine } = useMyArticles();
  const [aud, setAud] = useState('everyone');
  const articles = useMemo(() => (aud === 'mine' ? mine : aud === 'all' ? ARTICLES : ARTICLES.filter((a) => isFor(a, [aud]))), [aud, mine]);
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const options = [
    { value: 'everyone', label: 'Employees' },
    ...(user?.role !== 'EMPLOYEE' ? [{ value: 'mine', label: 'My role' }] : []),
    ...(user?.role === 'ADMIN' ? [...AUDIENCES.filter((a) => ['manager', 'finance', 'admin'].includes(a.value)), { value: 'all', label: 'Everything' }] : []),
  ];

  return (
    <div className="help-guide mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link to="/help" className="btn-ghost h-9 px-2"><ArrowLeft className="h-4 w-4" aria-hidden /> Help Center</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {options.length > 1 && <Segmented options={options} value={aud} onChange={setAud} />}
          <button type="button" className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print or save as PDF</button>
        </div>
      </div>

      <header className="mb-8 border-b border-line pb-6">
        <p className="kicker mb-1">User guide</p>
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">Voyage: travel and reimbursement</h1>
        <p className="mt-1 text-[14px] text-muted">Step-by-step help in plain words. Updated {today}. Policy numbers reflect the current company settings.</p>
        <nav aria-label="Contents" className="mt-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Contents</h2>
          <ol className="grid gap-1 text-[13.5px] sm:grid-cols-2">
            {articles.map((a, i) => (
              <li key={a.slug}><a href={`#guide-${a.slug}`} className="hover:text-brand">{i + 1}. {a.title}</a></li>
            ))}
          </ol>
        </nav>
      </header>

      {SECTIONS.map((section) => {
        const items = articles.filter((a) => a.section === section);
        if (!items.length) return null;
        return (
          <section key={section} className="mb-10" aria-label={section}>
            <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-muted">{section}</h2>
            {items.map((a) => (
              <article key={a.slug} id={`guide-${a.slug}`} className="help-guide-article mb-10" aria-labelledby={`guide-title-${a.slug}`}>
                <h3 id={`guide-title-${a.slug}`} className="text-[20px] font-semibold leading-snug tracking-tight">{articles.indexOf(a) + 1}. {a.title}</h3>
                <p className="mb-4 text-[13.5px] text-muted">{a.summary}</p>
                {a.slug === 'how-voyage-works' && <div className="mb-4"><FlowMap /></div>}
                <ArticleBody article={a} />
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
