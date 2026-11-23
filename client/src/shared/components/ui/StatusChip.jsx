import clsx from 'clsx';
import { Check, Clock, Undo2, X, Minus, Pencil, Landmark, CalendarClock, Wallet, Circle, SkipForward } from 'lucide-react';
import { STATUS, TONES } from '../../utils/status.js';

const ICONS = { check: Check, clock: Clock, undo: Undo2, x: X, minus: Minus, pencil: Pencil, landmark: Landmark, calendar: CalendarClock, wallet: Wallet, dot: Circle, skip: SkipForward };

export function StatusChip({ status, label, className, size = 'md' }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral', icon: 'dot' };
  const Icon = ICONS[s.icon] ?? Circle;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]',
        TONES[s.tone],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={2.4} aria-hidden />
      {label ?? s.label}
    </span>
  );
}
