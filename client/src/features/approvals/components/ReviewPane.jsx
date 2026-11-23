import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Undo2, X, ExternalLink, MapPin, CalendarDays, Paperclip, UserCheck, Plane, Receipt } from 'lucide-react';
import { Skeleton } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { ApprovalTimeline } from '../../../shared/components/ApprovalTimeline.jsx';
import { PolicyFlags } from '../../../shared/components/PolicyFlags.jsx';
import { money, date, nights, ago } from '../../../shared/utils/format.js';
import { ease } from '../../../shared/lib/motion.js';
import { approvalsApi } from '../api/approvalsApi.js';

function Kbd({ children }) {
  return <kbd className="ml-1 hidden rounded border border-current/20 px-1 font-sans text-[10px] opacity-70 lg:inline">{children}</kbd>;
}

/** Right-hand review pane for the selected inbox item. */
export function ReviewPane({ step, onDecide }) {
  const e = step.entity;
  const { data, isLoading } = useQuery({ queryKey: [e.type === 'TRAVEL' ? 'travel' : 'expenses', e.id], queryFn: () => approvalsApi.entity(e.type, e.id) });

  return (
    <motion.div key={step.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease }} className="flex h-full flex-col">
      <div className="border-b border-line p-5">
        <div className="flex items-start gap-3">
          <Avatar name={e.requester.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-muted">
              {e.requester.name} · {e.requester.title} · {e.requester.department?.name}
            </p>
            <h2 className="mt-0.5 text-[17px] font-semibold leading-snug tracking-tight">{e.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
              <span className="inline-flex items-center gap-1">{e.type === 'TRAVEL' ? <Plane className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}<span className="font-mono">{e.code}</span></span>
              <span>Submitted {ago(e.submittedAt)}</span>
              <span>{step.label} · level {step.level}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="num text-[22px] font-semibold tracking-tight">{money(e.amount)}</p>
            <Link to={e.link} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
              Full details <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {step.onBehalfOf && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand/[0.07] px-2.5 py-1.5 text-[12px] text-brand-ink">
            <UserCheck className="h-3.5 w-3.5" /> You are acting on behalf of {step.onBehalfOf.name}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-28" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <div>
              <p className="kicker mb-1.5">Purpose</p>
              <p className="text-[13.5px] leading-relaxed">{data.purpose}</p>
            </div>

            {e.type === 'TRAVEL' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-subtle p-3">
                  <p className="flex items-center gap-1 text-[11.5px] text-muted"><MapPin className="h-3 w-3" /> Route</p>
                  <p className="text-[13px] font-medium">{data.origin} → {data.destination}</p>
                </div>
                <div className="rounded-xl bg-subtle p-3">
                  <p className="flex items-center gap-1 text-[11.5px] text-muted"><CalendarDays className="h-3 w-3" /> Dates</p>
                  <p className="text-[13px] font-medium">{date(data.startDate, { day: 'numeric', month: 'short' })} – {date(data.endDate, { day: 'numeric', month: 'short' })} · {nights(data.startDate, data.endDate)}n</p>
                </div>
                {[['Transport', data.estTransport], ['Lodging', data.estLodging], ['Meals', data.estMeals], ['Other', data.estOther]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[12.5px]">
                    <span className="text-muted">{k}</span>
                    <span className="num font-medium">{money(v, data.currency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line">
                {data.lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 border-b border-line/60 px-3.5 py-2.5 text-[12.5px] last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{l.merchant}</p>
                      <p className="truncate text-[11.5px] text-muted">{date(l.date, { day: 'numeric', month: 'short' })} · {l.category.name}</p>
                    </div>
                    {l.attachments.length > 0 ? <Paperclip className="h-3.5 w-3.5 text-ok" aria-label="Receipt attached" /> : <span className="text-[11px] text-bad">No receipt</span>}
                    <span className="num w-24 text-right font-medium">{money(l.baseAmount)}</span>
                  </div>
                ))}
                {data.travelRequest && (
                  <div className="bg-subtle/60 px-3.5 py-2 text-[12px] text-muted">
                    Linked trip {data.travelRequest.code} · approved estimate {money(data.travelRequest.estTotalBase)}
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="kicker mb-2">Policy</p>
              <PolicyFlags flags={data.policyFlags} compact />
              {data.exceptionReason && <p className="mt-2 rounded-xl border border-line p-3 text-[12.5px]"><span className="font-medium">Justification: </span>{data.exceptionReason}</p>}
            </div>

            <div>
              <p className="kicker mb-3">Approval route</p>
              <ApprovalTimeline steps={data.steps.filter((s) => s.round === data.round)} />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface/80 p-4 backdrop-blur">
        <button type="button" className="btn-secondary" onClick={() => onDecide('RETURNED')}><Undo2 className="h-4 w-4" /> Return<Kbd>R</Kbd></button>
        <button type="button" className="btn-secondary text-bad" onClick={() => onDecide('REJECTED')}><X className="h-4 w-4" /> Reject<Kbd>X</Kbd></button>
        <button type="button" className="btn-success ml-auto" onClick={() => onDecide('APPROVED')}><Check className="h-4 w-4" /> Approve<Kbd>A</Kbd></button>
      </div>
    </motion.div>
  );
}
