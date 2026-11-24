import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Receipt, Plus, Search, Download, ArrowRight, Plane, CalendarClock, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, hasRole } from '../../../app/store.js';
import { PageHeader, Tabs, SkeletonRows, EmptyState, LoadMore } from '../../../shared/components/ui/primitives.jsx';
import { StatusChip } from '../../../shared/components/ui/StatusChip.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { FlagCount } from '../../../shared/components/PolicyFlags.jsx';
import { useDebounce } from '../../../shared/hooks/index.js';
import { usePaged } from '../../../shared/hooks/usePaged.js';
import { money, date, shortDate } from '../../../shared/utils/format.js';
import { list, item } from '../../../shared/lib/motion.js';
import { expensesApi } from '../api/expensesApi.js';

const TABS = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PENDING', label: 'In approval' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'FINANCE_REVIEW,SCHEDULED', label: 'With Finance' },
  { value: 'PAID', label: 'Paid' },
  { value: 'REJECTED,WITHDRAWN', label: 'Closed' },
];

export function ExpenseListPage() {
  const user = useAppStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const status = params.get('status') ?? '';
  const scope = params.get('scope') ?? 'mine';
  const term = useDebounce(search);
  const navigate = useNavigate();
  const listParams = { status: status || undefined, scope, search: term || undefined };
  const paged = usePaged(['expenses', 'list', listParams], (p) => expensesApi.list({ ...listParams, ...p }));
  const { isLoading, isFetching } = paged;
  const data = { items: paged.items, counts: paged.counts };
  const counts = data?.counts ?? {};
  const canTeam = hasRole(user, 'MANAGER', 'FINANCE', 'ADMIN', 'AUDITOR');
  const set = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHeader
        kicker="Expenses"
        title="Expense reports"
        description="Group your receipts into a report, submit it, and follow it all the way to payment."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => expensesApi.exportCsv({ status: status || undefined, scope, search: term || undefined }).catch((e) => toast.error(e.message))}>
              <Download className="h-4 w-4" /> Export
            </button>
            <Link to="/expenses/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New report
            </Link>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 2xl:flex-row 2xl:items-center">
          <Tabs
            id="exp-tabs"
            tabs={TABS.map((t) => ({ ...t, count: t.value ? t.value.split(',').reduce((a, s) => a + (counts[s] ?? 0), 0) : undefined }))}
            value={status}
            onChange={(v) => set('status', v)}
          />
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-between 2xl:justify-end">
            {canTeam && <Tabs id="exp-scope" tabs={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: user.role === 'MANAGER' ? 'My team' : 'Everyone' }]} value={scope} onChange={(v) => set('scope', v === 'mine' ? '' : v)} />}
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input h-9 pl-9" placeholder="Search code, title, person…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search expense reports" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows rows={6} />
        ) : !data?.items?.length ? (
          <EmptyState
            icon={Receipt}
            title={search || status ? 'No matching reports' : 'No expense reports yet'}
            body={search || status ? 'Try another filter.' : 'Create a report, add your receipts, and we will check them against policy as you go.'}
            action={!search && !status && <Link to="/expenses/new" className="btn-primary"><Plus className="h-4 w-4" /> New expense report</Link>}
          />
        ) : (
          <motion.ul variants={list} initial="initial" animate="animate" className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            {data.items.map((r) => (
              <motion.li key={r.id} variants={item}>
                <button type="button" onClick={() => navigate(`/expenses/${r.id}`)} className="table-row group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-b border-line/60 px-5 py-3.5 text-left last:border-0 md:grid-cols-[1.7fr_1fr_0.9fr_0.6fr_1.1fr_24px] md:items-center md:gap-4">
                  <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3 md:col-start-auto md:row-start-auto">
                    {scope === 'mine' ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft to-surface ring-1 ring-line">
                        <Receipt className="h-[18px] w-[18px] text-brand" />
                      </span>
                    ) : (
                      <Avatar name={r.employee.name} size={40} />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{r.title}</p>
                      <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                        <span className="font-mono text-[11.5px]">{r.code}</span>
                        {scope !== 'mine' && <span>· {r.employee.name}</span>}
                        {r.travelRequest && (
                          <span className="inline-flex items-center gap-1">
                            · <Plane className="h-3 w-3" /> {r.travelRequest.code}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="col-start-1 row-start-2 pl-[52px] text-[12.5px] md:col-start-auto md:row-start-auto md:pl-0">
                    <p>{r._count.lines} expense{r._count.lines === 1 ? '' : 's'}</p>
                    <p className="text-[11.5px] text-muted">{r.submittedAt ? `Submitted ${shortDate(r.submittedAt)}` : `Updated ${shortDate(r.updatedAt)}`}</p>
                  </div>
                  <p className="num text-[14px] font-semibold col-start-2 row-start-1 self-center text-right md:col-start-auto md:row-start-auto">{money(r.totalBase)}</p>
                  <div className={`col-start-1 row-start-3 pl-[52px] md:col-start-auto md:row-start-auto md:block md:pl-0 ${r.policyFlags?.length ? '' : 'hidden'}`}>{r.policyFlags?.length ? <FlagCount flags={r.policyFlags} /> : <span className="text-[12px] text-muted">Clean</span>}</div>
                  <div className="col-start-2 row-start-2 flex min-w-0 flex-col items-end md:col-start-auto md:row-start-auto md:block">
                    <StatusChip status={r.status} size="sm" />
                    <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted">
                      {r.steps?.[0] && <>With {r.steps[0].approver.name}</>}
                      {r.status === 'SCHEDULED' && r.payment?.scheduledFor && (<><CalendarClock className="h-3 w-3" /> Pays {date(r.payment.scheduledFor)}</>)}
                      {r.status === 'PAID' && r.payment?.paidAt && (<><Wallet className="h-3 w-3" /> Paid {date(r.payment.paidAt)}</>)}
                    </p>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand md:block" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
        {!isLoading && <LoadMore shown={paged.items.length} total={paged.total} hasMore={paged.hasNextPage} loading={paged.isFetchingNextPage} onMore={() => paged.fetchNextPage()} noun="reports" />}
      </div>
    </div>
  );
}
