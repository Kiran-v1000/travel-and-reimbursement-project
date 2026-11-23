import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, X, Undo2, Clock, Circle, SkipForward, Minus, Zap, UserCheck } from 'lucide-react';
import { Avatar } from './ui/Avatar.jsx';
import { dateTime, ago } from '../utils/format.js';
import { ease } from '../lib/motion.js';

const META = {
  APPROVED: { icon: Check, ring: 'bg-ok text-white dark:text-slate-950', text: 'Approved' },
  REJECTED: { icon: X, ring: 'bg-bad text-white dark:text-slate-950', text: 'Rejected' },
  RETURNED: { icon: Undo2, ring: 'bg-warn text-white dark:text-slate-950', text: 'Returned for changes' },
  PENDING: { icon: Clock, ring: 'bg-brand text-white dark:text-slate-950 shadow-glow', text: 'Waiting for decision' },
  WAITING: { icon: Circle, ring: 'bg-subtle text-muted ring-1 ring-line', text: 'Up next' },
  SKIPPED: { icon: SkipForward, ring: 'bg-subtle text-muted ring-1 ring-line', text: 'Skipped' },
  CANCELLED: { icon: Minus, ring: 'bg-subtle text-muted ring-1 ring-line', text: 'Closed' },
};

/** Vertical approval timeline grouped by routing round (ordered list, aria-current on the active step). */
export function ApprovalTimeline({ steps = [], currentRound }) {
  if (!steps.length) return <p className="text-[13px] text-muted">Approval route is created when the item is submitted.</p>;
  const rounds = [...new Set(steps.map((s) => s.round))].sort((a, b) => b - a);
  return (
    <div className="space-y-6">
      {rounds.map((round) => {
        const rs = steps.filter((s) => s.round === round);
        const old = currentRound && round !== currentRound;
        return (
          <div key={round} className={clsx(old && 'opacity-70')}>
            {rounds.length > 1 && (
              <div className="kicker mb-3 flex items-center gap-2">
                {round === rounds[0] ? 'Current submission' : `Submission ${round}`}
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            {rs[0]?.ruleName && (
              <p className="mb-3 text-[12px] text-muted">
                Rule: <span className="font-medium text-ink/80">{rs[0].ruleName}</span>
                {rs[0].ruleVersion ? ` · v${rs[0].ruleVersion}` : ''}
              </p>
            )}
            <ol className="relative">
              {rs.map((s, i) => {
                const m = META[s.status] ?? META.WAITING;
                const Icon = m.icon;
                const last = i === rs.length - 1;
                return (
                  <motion.li
                    key={s.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.24, ease }}
                    className="relative flex gap-3.5 pb-5 last:pb-0"
                    aria-current={s.status === 'PENDING' ? 'step' : undefined}
                  >
                    {!last && <span className={clsx('absolute left-[13px] top-8 h-[calc(100%-26px)] w-0.5 rounded', s.status === 'APPROVED' ? 'bg-ok/40' : 'bg-line')} />}
                    <span className={clsx('relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', m.ring)}>
                      {s.status === 'PENDING' && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" />}
                      <Icon className="relative h-3.5 w-3.5" strokeWidth={2.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[13px] font-semibold">{s.label}</span>
                        <span className="text-[11.5px] text-muted">Level {s.level}</span>
                        {s.escalated && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-1.5 py-0.5 text-[10.5px] font-medium text-warn">
                            <Zap className="h-3 w-3" /> Escalated
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[12.5px]">
                        <Avatar name={s.approver?.name} size={20} />
                        <span className="font-medium text-ink/90">{s.approver?.name}</span>
                        <span className="text-muted">· {m.text}</span>
                      </div>
                      {s.actedBy && s.actedBy.id !== s.approverId && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-brand-ink">
                          <UserCheck className="h-3.5 w-3.5" /> Acted by delegate {s.actedBy.name}
                        </p>
                      )}
                      {s.comment && <p className="mt-2 rounded-xl bg-subtle px-3 py-2 text-[12.5px] leading-relaxed text-ink/85">“{s.comment}”</p>}
                      {s.resolution && !s.comment && <p className="mt-1 text-[12px] text-muted">{s.resolution}</p>}
                      <p className="mt-1 text-[11.5px] text-muted">
                        {s.actedAt ? dateTime(s.actedAt) : s.status === 'PENDING' && s.activatedAt ? `Waiting ${ago(s.activatedAt).replace(' ago', '')}` : ''}
                        {s.status === 'PENDING' && s.dueAt && ` · due ${dateTime(s.dueAt)}`}
                      </p>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
