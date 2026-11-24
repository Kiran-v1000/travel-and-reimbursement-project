import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Clock, ThumbsDown, ThumbsUp, Users } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../../app/store.js';
import { BY_SLUG, AUDIENCES } from '../lib/help.js';
import { helpApi } from '../api/helpApi.js';
import { ArticleBody } from './ArticleBody.jsx';
import { useHelpValues } from '../hooks/useHelp.js';
import { FlowMap } from './FlowMap.jsx';

const audienceLabel = (a) => AUDIENCES.find((x) => x.value === a)?.label ?? a;

/** One help article: meta line, optional flow map, text, related articles, feedback. */
export function ArticleView({ article, inPanel = false, headingLevel = 1 }) {
  const openHelp = useAppStore((s) => s.openHelp);
  const [vote, setVote] = useState(null);
  const { helpContact } = useHelpValues();
  const feedback = useMutation({ mutationFn: (helpful) => helpApi.feedback(article.slug, helpful) });
  const H = `h${headingLevel}`;
  const related = article.related.map((s) => BY_SLUG[s]).filter(Boolean);

  return (
    <article aria-labelledby={`help-title-${article.slug}`}>
      {!inPanel && (
        <>
          <H id={`help-title-${article.slug}`} className="text-[24px] font-semibold leading-tight tracking-tight md:text-[26px]">{article.title}</H>
          <p className="mt-1 text-[14px] text-muted">{article.summary}</p>
        </>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {article.minutes} min read</span>
        {!article.audience.includes('everyone') && (
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /> For {article.audience.map(audienceLabel).join(', ').toLowerCase()}</span>
        )}
      </p>

      {article.body && article.slug === 'how-voyage-works' && (
        <div className="mt-5"><FlowMap compact={inPanel} /></div>
      )}

      <div className="mt-5"><ArticleBody article={article} inPanel={inPanel} /></div>

      {related.length > 0 && (
        <section className="mt-8" aria-labelledby={`related-${article.slug}`}>
          <h2 id={`related-${article.slug}`} className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Related</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.slug}>
                {inPanel ? (
                  <button type="button" onClick={() => openHelp(r.slug)} className="card w-full p-3 text-left transition-colors hover:border-brand/40">
                    <span className="block text-[13px] font-medium">{r.title}</span>
                    <span className="block text-[12px] text-muted">{r.summary}</span>
                  </button>
                ) : (
                  <Link to={`/help/${r.slug}`} className="card block p-3 transition-colors hover:border-brand/40">
                    <span className="block text-[13px] font-medium">{r.title}</span>
                    <span className="block text-[12px] text-muted">{r.summary}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-[13px]" role="group" aria-label="Was this helpful?">
        {vote == null ? (
          <>
            <span className="text-muted">Was this helpful?</span>
            {[{ v: true, Icon: ThumbsUp, label: 'Yes' }, { v: false, Icon: ThumbsDown, label: 'No' }].map(({ v, Icon, label }) => (
              <button key={label} type="button" className="btn-secondary h-8 px-3" onClick={() => { setVote(v); feedback.mutate(v); }}>
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </button>
            ))}
          </>
        ) : (
          <p role="status" className={clsx(vote ? 'text-ok' : 'text-muted')}>
            {vote ? 'Thanks, glad it helped.' : `Thanks. We use this to improve the guide. Still stuck? See the FAQ or contact ${helpContact}.`}
          </p>
        )}
      </div>
    </article>
  );
}
