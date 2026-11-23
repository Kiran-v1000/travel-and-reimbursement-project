import { History } from 'lucide-react';
import { dateTime, titleCase } from '../utils/format.js';

const describe = (a) => {
  const action = a.action.split('.')[1] ?? a.action;
  const map = {
    created: 'created the draft', updated: 'edited details', submitted: 'submitted for approval', resubmitted: 'resubmitted after changes',
    withdrawn: 'withdrew it', step_approved: `approved (${a.details?.label ?? 'step'})`, step_rejected: `rejected (${a.details?.label ?? 'step'})`,
    step_returned: `returned it (${a.details?.label ?? 'step'})`, line_added: `added ${a.details?.merchant ?? 'a line'}`, line_updated: 'edited a line',
    line_deleted: `removed ${a.details?.merchant ?? 'a line'}`, approved: 'approved for payment', rejected: 'rejected', returned: 'returned it',
    recoded: 'corrected accounting codes', payment_recorded: `recorded payment ${a.details?.reference ?? ''}`, uploaded: 'attached receipts', deleted: 'removed a file',
    escalated: `escalated from ${a.details?.from} to ${a.details?.to}`,
  };
  return map[action] ?? titleCase(action);
};

/** Tamper-evident audit entries for one record. */
export function ActivityLog({ items = [] }) {
  if (!items.length) return <p className="text-[13px] text-muted">No activity yet.</p>;
  return (
    <ul className="space-y-3">
      {[...items].reverse().map((a) => (
        <li key={a.id} className="flex gap-3 text-[12.5px]">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <div className="min-w-0">
            <p>
              <span className="font-medium">{a.actorName ?? 'System'}</span> <span className="text-ink/80">{describe(a)}</span>
              {a.details?.onBehalfOf && <span className="text-muted"> on behalf of {a.details.onBehalfOf}</span>}
            </p>
            <p className="text-[11px] text-muted">
              {dateTime(a.createdAt)} · #{a.seq} · <span className="font-mono">{a.hash.slice(0, 10)}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
