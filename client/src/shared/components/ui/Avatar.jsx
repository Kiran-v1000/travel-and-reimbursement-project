import clsx from 'clsx';
import { initials } from '../../utils/format.js';

const PALETTE = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-500',
];

const hash = (s = '') => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, size = 32, className, ring }) {
  return (
    <span
      title={name}
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white',
        PALETTE[hash(name) % PALETTE.length],
        ring && 'ring-2 ring-surface',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
