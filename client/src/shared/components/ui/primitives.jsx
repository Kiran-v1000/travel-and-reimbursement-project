import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, animate } from 'framer-motion';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { money } from '../../utils/format.js';

export function PageHeader({ kicker, title, description, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h1 className="text-[24px] font-semibold tracking-tight md:text-[26px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children, className, required }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-bad">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-bad">
          {Array.isArray(error) ? error[0] : error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('h-4 w-4 animate-spin', className)} aria-hidden />;
}

export function Skeleton({ className }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 rounded-2xl bg-brand/20 blur-xl" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-soft to-surface ring-1 ring-line">
            <Icon className="h-6 w-6 text-brand" />
          </div>
        </div>
      )}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/** Animated count-up for KPI numbers (skipped when reduced motion is preferred). */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), className }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return undefined;
    }
    const controls = animate(from.current, value, { duration: 0.7, ease: [0.16, 1, 0.3, 1], onUpdate: setDisplay });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span className={clsx('num', className)}>{format(display)}</span>;
}

export const Money = ({ value, currency = 'INR', className }) => <span className={clsx('num', className)}>{money(value, currency)}</span>;

/** Pill tabs with a sliding indicator. */
export function Tabs({ tabs, value, onChange, id = 'tabs', className }) {
  return (
    <div role="tablist" className={clsx('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-subtle p-1', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={clsx('relative h-8 shrink-0 rounded-lg px-3 text-[12.5px] font-medium transition-colors', active ? 'text-ink' : 'text-muted hover:text-ink')}
          >
            {active && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-lg bg-surface shadow-card ring-1 ring-line" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
            <span className="relative flex items-center gap-1.5">
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={clsx('num rounded-full px-1.5 text-[10.5px] font-semibold', active ? 'bg-brand text-white dark:text-slate-950' : 'bg-line/70 text-muted')}>{t.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return <Tabs tabs={options} value={value} onChange={onChange} id={`seg-${options.map((o) => o.value).join('')}`} />;
}
