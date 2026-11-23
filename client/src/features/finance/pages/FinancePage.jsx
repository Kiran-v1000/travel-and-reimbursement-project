import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePaged } from '../../../shared/hooks/usePaged.js';
import { motion } from 'framer-motion';
import { Landmark, ArrowRight, CalendarClock, Wallet, ShieldAlert, Clock, BookOpenCheck } from 'lucide-react';
import { PageHeader, Tabs, SkeletonRows, EmptyState, AnimatedNumber, LoadMore } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { StatusChip } from '../../../shared/components/ui/StatusChip.jsx';
import { FlagCount } from '../../../shared/components/PolicyFlags.jsx';
import { money, date, ago } from '../../../shared/utils/format.js';
import { PAYMENT_METHODS } from '../../../shared/utils/status.js';
import { list, item } from '../../../shared/lib/motion.js';
import { financeApi } from '../api/financeApi.js';
import { AccountingExportDialog } from '../components/AccountingExportDialog.jsx';

export function FinancePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('queue');
  const [flagged, setFlagged] = useState(false);
  const [exporting, setExporting] = useState(false);
  const queue = usePaged(['finance', 'queue', flagged], (p) => financeApi.queue({ flagged: flagged || undefined, ...p }));
  const scheduled = usePaged(['finance', 'payments', 'SCHEDULED'], (p) => financeApi.payments('SCHEDULED', p));
  const paid = usePaged(['finance', 'payments', 'PAID'], (p) => financeApi.payments('PAID', p));
  const rows = tab === 'queue' ? queue : tab === 'scheduled' ? scheduled : paid;

  const kpis = [
    { label: 'To review', count: queue.total, amount: queue.amount, icon: Landmark, tone: 'text-brand bg-brand/10' },
    { label: 'Scheduled', count: scheduled.total, amount: scheduled.amount, icon: CalendarClock, tone: 'text-info bg-info/10' },
    { label: 'Paid (all time)', count: paid.total, amount: paid.amount, icon: Wallet, tone: 'text-ok bg-ok/10' },
  ];

  return (
    <div>
      <PageHeader kicker="Finance" title="Reimbursement desk" description="Review manager-approved reports, correct coding, schedule payouts and record payments."
        actions={<button type="button" className="btn-secondary" onClick={() => setExporting(true)}><BookOpenCheck className="h-4 w-4" /> Accounting export</button>} />
      <AccountingExportDialog open={exporting} onClose={() => setExporting(false)} />

      <motion.div variants={list} initial="initial" animate="animate" className="mb-6 grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <motion.div key={k.label} variants={item} className="card flex items-center gap-4 p-5">
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${k.tone}`}><k.icon className="h-5 w-5" /></span>
            <div>
              <p className="text-[12.5px] text-muted">{k.label} · {k.count}</p>
              <p className="text-[22px] font-semibold tracking-tight"><AnimatedNumber value={k.amount} format={(n) => money(n)} /></p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
          <Tabs id="fin-tabs" value={tab} onChange={setTab} tabs={[{ value: 'queue', label: 'Review queue', count: queue.total }, { value: 'scheduled', label: 'Scheduled', count: scheduled.total }, { value: 'paid', label: 'Paid' }]} />
          {tab === 'queue' && (
            <label className="flex items-center gap-2 text-[12.5px] sm:ml-auto">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
              Only reports with policy exceptions
            </label>
          )}
        </div>
        {rows.isLoading ? (
          <SkeletonRows />
        ) : !rows.items.length ? (
          <EmptyState icon={tab === 'queue' ? Landmark : Wallet} title={tab === 'queue' ? 'Queue is clear' : 'Nothing here yet'} body={tab === 'queue' ? 'Reports appear here once all approvers sign off.' : undefined} />
        ) : (
          <motion.ul variants={list} initial="initial" animate="animate">
            {rows.items.map((r) => (
              <motion.li key={r.id} variants={item}>
                <button type="button" onClick={() => navigate(`/expenses/${r.id}`)} className="table-row group grid w-full grid-cols-1 gap-2 border-b border-line/60 px-5 py-3.5 text-left last:border-0 md:grid-cols-[1.6fr_1fr_0.8fr_0.9fr_24px] md:items-center md:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={r.employee.name} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{r.title}</p>
                      <p className="truncate text-[12px] text-muted">
                        <span className="font-mono">{r.code}</span> · {r.employee.name} · {r.employee.department?.name} · {r._count.lines} lines
                      </p>
                    </div>
                  </div>
                  <div className="text-[12.5px]">
                    {tab === 'queue' ? (
                      <p className="flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" /> Approved {ago(r.approvedAt)}</p>
                    ) : (
                      <p className="text-muted">{PAYMENT_METHODS[r.payment?.method]} · {tab === 'paid' ? `paid ${date(r.payment?.paidAt)}` : `due ${date(r.payment?.scheduledFor)}`}</p>
                    )}
                    <p className="text-[11.5px] text-muted">{r.costCenter?.code}{r.travelRequest && ` · ${r.travelRequest.code}`}</p>
                  </div>
                  <div>{r.policyFlags?.length ? <FlagCount flags={r.policyFlags} /> : <span className="text-[12px] text-muted">Clean</span>}{r.exceptionReason && <ShieldAlert className="ml-1 inline h-3.5 w-3.5 text-warn" aria-label="Has justification" />}</div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <StatusChip status={r.status} size="sm" />
                    <span className="num text-[14px] font-semibold">{money(r.totalBase)}</span>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand md:block" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
        {!rows.isLoading && (
          <LoadMore shown={rows.items.length} total={rows.total} hasMore={rows.hasNextPage} loading={rows.isFetchingNextPage} onMore={() => rows.fetchNextPage()} noun="reports" />
        )}
      </div>
    </div>
  );
}
