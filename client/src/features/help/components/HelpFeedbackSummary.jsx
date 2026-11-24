import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { BY_SLUG } from '../lib/help.js';
import { helpApi } from '../api/helpApi.js';

/** Administrators: which articles help, and which need work (from "Was this helpful?"). */
export function HelpFeedbackSummary() {
  const { data = [], isLoading } = useQuery({ queryKey: ['help', 'feedback'], queryFn: helpApi.stats });
  const rows = data.filter((r) => BY_SLUG[r.slug]).sort((a, b) => b.notHelpful - a.notHelpful || b.helpful - a.helpful);
  return (
    <section aria-labelledby="feedback-title" className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 id="feedback-title" className="text-[15px] font-semibold">Article feedback</h2>
        <p className="text-[12.5px] text-muted">Answers to “Was this helpful?”, last 90 days. Articles with the most “No” are listed first: those are the ones to improve. Only administrators see this.</p>
      </div>
      {isLoading ? (
        <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
      ) : !rows.length ? (
        <p className="px-5 py-4 text-[13px] text-muted">No feedback yet.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
              <Link to={`/help/${r.slug}`} className="min-w-0 flex-1 font-medium hover:text-brand">{BY_SLUG[r.slug].title}</Link>
              <span className="inline-flex items-center gap-1 text-ok"><ThumbsUp className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">Helpful:</span> {r.helpful}</span>
              <span className="inline-flex items-center gap-1 text-bad"><ThumbsDown className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">Not helpful:</span> {r.notHelpful}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
