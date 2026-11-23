import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { ShieldCheck, ShieldX, Download, Search, Link2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { get, download } from '../../../shared/lib/api.js';
import { PageHeader, SkeletonRows, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { useDebounce } from '../../../shared/hooks/index.js';
import { dateTime } from '../../../shared/utils/format.js';

const ENTITIES = ['', 'TRAVEL', 'EXPENSE', 'USER', 'RULE', 'SETTINGS', 'DELEGATION', 'CATEGORY', 'CURRENCY'];

export function AuditPage() {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [open, setOpen] = useState(null);
  const term = useDebounce(search);
  const params = { search: term || undefined, entityType: entityType || undefined, take: 200 };
  const { data, isLoading } = useQuery({ queryKey: ['audit', params], queryFn: () => get('/audit', params) });
  const verify = useQuery({ queryKey: ['audit', 'verify'], queryFn: () => get('/audit/verify'), enabled: false });

  return (
    <div>
      <PageHeader
        kicker="Compliance"
        title="Audit trail"
        description="Every submission, decision, edit and payment is recorded in a hash-chained log. Changing any past entry breaks the chain."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => verify.refetch()} disabled={verify.isFetching}>
              {verify.isFetching ? <Spinner /> : <Link2 className="h-4 w-4" />} Verify integrity
            </button>
            <button type="button" className="btn-primary" onClick={() => download('/audit/export', params, 'audit-log.csv').catch((e) => toast.error(e.message))}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </>
        }
      />

      <AnimatePresence>
        {verify.data && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={clsx('mb-5 flex items-center gap-3 rounded-2xl border p-4', verify.data.valid ? 'border-ok/30 bg-ok/[0.07]' : 'border-bad/30 bg-bad/[0.07]')}>
            {verify.data.valid ? <ShieldCheck className="h-6 w-6 text-ok" /> : <ShieldX className="h-6 w-6 text-bad" />}
            <div className="text-[13px]">
              <p className="font-semibold">{verify.data.valid ? 'Chain intact' : `Chain broken at entry #${verify.data.brokenAt}`}</p>
              <p className="text-muted">{verify.data.checked} entries re-hashed and checked just now.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-9 pl-9" placeholder="Search person, action or record id…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search audit log" />
          </div>
          <select className="input h-9 sm:w-48" value={entityType} onChange={(e) => setEntityType(e.target.value)} aria-label="Record type">
            {ENTITIES.map((e) => <option key={e} value={e}>{e ? e.charAt(0) + e.slice(1).toLowerCase() : 'All records'}</option>)}
          </select>
        </div>
        {isLoading ? <SkeletonRows /> : (
          <ul>
            {data.items.map((a) => (
              <li key={a.id} className="border-b border-line/60 last:border-0">
                <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="table-row flex w-full items-center gap-3 px-5 py-3 text-left" aria-expanded={open === a.id}>
                  <span className="num w-12 text-[11.5px] text-muted">#{a.seq}</span>
                  <Avatar name={a.actorName ?? 'System'} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]"><span className="font-medium">{a.actorName ?? 'System'}</span> · <span className="font-mono text-[12px]">{a.action}</span></span>
                    <span className="block truncate text-[11.5px] text-muted">{a.entityType}{a.details?.code ? ` · ${a.details.code}` : a.entityId ? ` · ${a.entityId}` : ''}</span>
                  </span>
                  <span className="hidden font-mono text-[11px] text-muted md:block">{a.hash.slice(0, 12)}…</span>
                  <span className="w-28 text-right text-[11.5px] text-muted">{dateTime(a.createdAt)}</span>
                  <ChevronDown className={clsx('h-4 w-4 text-muted transition-transform', open === a.id && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {open === a.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="grid gap-3 bg-subtle/50 px-5 py-4 text-[12px] md:grid-cols-2">
                        <pre className="overflow-x-auto rounded-xl bg-surface p-3 font-mono text-[11.5px] leading-relaxed">{JSON.stringify(a.details, null, 2)}</pre>
                        <div className="space-y-2 break-all font-mono text-[11px] text-muted">
                          <p><span className="font-sans font-semibold text-ink">Hash</span><br />{a.hash}</p>
                          <p><span className="font-sans font-semibold text-ink">Previous</span><br />{a.prevHash}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        )}
        {data && <p className="border-t border-line px-5 py-2.5 text-[11.5px] text-muted">Showing {data.items.length} of {data.total} entries</p>}
      </div>
    </div>
  );
}
