import { motion } from 'framer-motion';
import { ChevronRight, Info } from 'lucide-react';
import { Avatar } from './ui/Avatar.jsx';
import { ease } from '../lib/motion.js';

/** "Who will approve this?" chain shown before submitting. */
export function RoutePreview({ route }) {
  if (!route) return null;
  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="kicker">Approval route</span>
        <span className="truncate pl-2 text-[11.5px] text-muted">{route.rule?.name}</span>
      </div>
      <ol className="flex flex-wrap items-center gap-1.5">
        {route.levels.map((l, i) => (
          <motion.li key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06, duration: 0.2, ease }} className="flex items-center gap-1.5">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pl-1.5 pr-2.5">
              <div className="flex -space-x-1.5">
                {l.approvers.map((a) => (
                  <Avatar key={a.id} name={a.name} size={22} ring />
                ))}
              </div>
              <div className="leading-tight">
                <p className="text-[11px] text-muted">{l.label}</p>
                <p className="text-[12px] font-medium">{l.approvers.map((a) => a.name).join(' + ') || 'Unassigned'}</p>
              </div>
            </div>
            {i < route.levels.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted" />}
          </motion.li>
        ))}
      </ol>
      {route.levels.some((l) => l.approvers.some((a) => a.note)) && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          {route.levels.flatMap((l) => l.approvers.filter((a) => a.note).map((a) => a.note))[0]}
        </p>
      )}
    </div>
  );
}
