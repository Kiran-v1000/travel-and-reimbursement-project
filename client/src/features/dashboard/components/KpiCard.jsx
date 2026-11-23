import { motion } from 'framer-motion';
import clsx from 'clsx';
import { AnimatedNumber } from '../../../shared/components/ui/primitives.jsx';
import { item } from '../../../shared/lib/motion.js';

const TONE = {
  brand: 'from-indigo-500/15 to-violet-500/5 text-brand',
  ok: 'from-emerald-500/15 to-teal-500/5 text-ok',
  warn: 'from-amber-500/15 to-orange-500/5 text-warn',
  info: 'from-sky-500/15 to-cyan-500/5 text-info',
};

export function KpiCard({ icon: Icon, label, value, format, sub, tone = 'brand', onClick }) {
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp variants={item} type={onClick ? 'button' : undefined} onClick={onClick} className={clsx('card relative overflow-hidden p-5 text-left', onClick && 'card-hover')}>
      <div className={clsx('absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl', TONE[tone])} />
      <div className="relative flex items-start justify-between">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        <span className={clsx('flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br', TONE[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="relative mt-3 text-[26px] font-semibold tracking-tight">
        <AnimatedNumber value={value} format={format} />
      </p>
      {sub && <p className="relative mt-1 text-[12px] text-muted">{sub}</p>}
    </Comp>
  );
}
