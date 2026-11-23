import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ShieldAlert, AlertTriangle, ShieldCheck } from 'lucide-react';

/** Policy findings with icon + text (never colour alone). */
export function PolicyFlags({ flags = [], compact, showOk = true, className }) {
  if (!flags.length) {
    return showOk ? (
      <div className={clsx('flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-[12.5px] font-medium text-ok', className)}>
        <ShieldCheck className="h-4 w-4" /> Within policy
      </div>
    ) : null;
  }
  return (
    <ul className={clsx('space-y-2', className)} aria-live="polite">
      <AnimatePresence initial={false}>
        {flags.map((f, i) => {
          const v = f.severity === 'violation';
          const Icon = v ? ShieldAlert : AlertTriangle;
          return (
            <motion.li
              key={`${f.code}-${f.lineId ?? i}`}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={clsx('flex items-start gap-2.5 rounded-xl px-3 py-2 text-[12.5px] leading-snug', v ? 'bg-bad/[0.07] text-bad' : 'bg-warn/10 text-warn')}
            >
              <Icon className="mt-px h-4 w-4 shrink-0" />
              <span className="text-ink/85">
                {!compact && <span className={clsx('mr-1 font-semibold', v ? 'text-bad' : 'text-warn')}>{v ? 'Policy exception:' : 'Heads up:'}</span>}
                {f.message}
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

export const hasViolation = (flags = []) => flags.some((f) => f.severity === 'violation');

export function FlagCount({ flags = [] }) {
  if (!flags.length) return null;
  const v = hasViolation(flags);
  return (
    <span title={flags.map((f) => f.message).join('\n')} className={clsx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold', v ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn')}>
      {v ? <ShieldAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {flags.length}
    </span>
  );
}
