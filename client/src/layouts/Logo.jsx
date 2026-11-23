import clsx from 'clsx';

export function Logo({ invert, collapsed }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-500 shadow-glow">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 7l7 11 7-11" />
        </svg>
      </span>
      {!collapsed && (
        <span className={clsx('leading-none', invert ? 'text-white' : 'text-ink')}>
          <span className="block text-[16px] font-semibold tracking-tight">Voyage</span>
          <span className={clsx('block text-[10.5px] font-medium tracking-wide', invert ? 'text-white/50' : 'text-muted')}>Travel &amp; Reimbursement</span>
        </span>
      )}
    </div>
  );
}
