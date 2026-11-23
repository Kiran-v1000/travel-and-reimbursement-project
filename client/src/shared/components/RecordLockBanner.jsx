import { motion } from 'framer-motion';
import { Archive, Lock } from 'lucide-react';
import { date } from '../utils/format.js';

/** Shown on a trip / expense report that is under legal hold or was purged by retention. */
export function RecordLockBanner({ holds = [], purgedAt }) {
  if (!purgedAt && !holds.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-2" role="status">
      {holds.map((h) => (
        <div key={h.id} className="flex items-start gap-3 rounded-2xl border border-bad/25 bg-bad/[0.06] p-4 text-[13px]">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
          <div>
            <p className="font-medium">On legal hold{h.reference ? ` · ${h.reference}` : ''}</p>
            <p className="text-ink/80">{h.reason}. This record is preserved and cannot be changed or deleted. Placed by {h.placedBy?.name} on {date(h.placedAt)}.</p>
          </div>
        </div>
      ))}
      {purgedAt && (
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-subtle/60 p-4 text-[13px]">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <div>
            <p className="font-medium">Archived under the retention policy on {date(purgedAt)}</p>
            <p className="text-muted">Receipts and personal details were removed. Codes, dates and amounts are kept for the books.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
