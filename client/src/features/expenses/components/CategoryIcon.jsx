import { Plane, TrainFront, BedDouble, UtensilsCrossed, CarTaxiFront, Stamp, Wine, Wifi, Receipt } from 'lucide-react';
import clsx from 'clsx';

const ICONS = { plane: Plane, train: TrainFront, bed: BedDouble, utensils: UtensilsCrossed, car: CarTaxiFront, stamp: Stamp, wine: Wine, wifi: Wifi, receipt: Receipt };
const TINTS = {
  plane: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  train: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
  bed: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  utensils: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  car: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  stamp: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  wine: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300',
  wifi: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
  receipt: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

export function CategoryIcon({ icon = 'receipt', size = 36 }) {
  const Icon = ICONS[icon] ?? Receipt;
  return (
    <span className={clsx('flex shrink-0 items-center justify-center rounded-xl', TINTS[icon] ?? TINTS.receipt)} style={{ width: size, height: size }}>
      <Icon className="h-4 w-4" />
    </span>
  );
}
