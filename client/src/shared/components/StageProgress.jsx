import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, X, Undo2 } from 'lucide-react';
import { STATUS } from '../utils/status.js';

/** Horizontal lifecycle stepper (Draft → … → Paid) for a record. */
export function StageProgress({ stages, status }) {
  const terminalBad = ['REJECTED', 'WITHDRAWN'].includes(status);
  const returned = status === 'RETURNED';
  const idx = returned ? 0 : terminalBad ? -1 : stages.indexOf(status);
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {stages.map((s, i) => {
        const done = idx > i || (idx === stages.length - 1 && i === idx);
        const current = idx === i && !done;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={current ? 'step' : undefined}>
            <div className="min-w-0 flex-1">
              <div className="relative h-1.5 overflow-hidden rounded-full bg-subtle">
                <motion.div
                  className={clsx('absolute inset-y-0 left-0 rounded-full', terminalBad ? 'bg-bad/60' : returned && i === 0 ? 'bg-warn' : 'bg-brand')}
                  initial={{ width: 0 }}
                  animate={{ width: done ? '100%' : current ? '55%' : terminalBad && i === 0 ? '100%' : '0%' }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <p className={clsx('mt-1.5 flex items-center gap-1 truncate text-[11px]', done || current ? 'font-medium text-ink' : 'text-muted')}>
                {done && <Check className="h-3 w-3 text-ok" strokeWidth={3} />}
                {current && returned && <Undo2 className="h-3 w-3 text-warn" />}
                {i === 0 && returned ? 'Returned' : STATUS[s]?.label}
              </p>
            </div>
          </li>
        );
      })}
      {terminalBad && (
        <li className="flex items-center gap-1 text-[11px] font-medium text-bad">
          <X className="h-3 w-3" /> {STATUS[status].label}
        </li>
      )}
    </ol>
  );
}
