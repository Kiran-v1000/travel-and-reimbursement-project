import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plane, Plus, Search, Download, MapPin, Globe2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, hasRole } from '../../../app/store.js';
import { PageHeader, Tabs, SkeletonRows, EmptyState, LoadMore } from '../../../shared/components/ui/primitives.jsx';
import { StatusChip } from '../../../shared/components/ui/StatusChip.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { FlagCount } from '../../../shared/components/PolicyFlags.jsx';
import { useDebounce } from '../../../shared/hooks/index.js';
import { usePaged } from '../../../shared/hooks/usePaged.js';
import { money, date, nights } from '../../../shared/utils/format.js';
import { list, item } from '../../../shared/lib/motion.js';
import { travelApi } from '../api/travelApi.js';

const TABS = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PENDING', label: 'Awaiting approval' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED,WITHDRAWN', label: 'Closed' },
];

export function TravelListPage() {
  const user = useAppStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const status = params.get('status') ?? '';
  const scope = params.get('scope') ?? 'mine';
  const navigate = useNavigate();
  const term = useDebounce(search);
  const listParams = { status: status || undefined, scope, search: term || undefined };
  const paged = usePaged(['travel', 'list', listParams], (p) => travelApi.list({ ...listParams, ...p }));
  const { isLoading, isFetching } = paged;
  const data = { items: paged.items, counts: paged.counts };
  const canTeam = hasRole(user, 'MANAGER', 'FINANCE', 'ADMIN', 'AUDITOR');
  const counts = data?.counts ?? {};
  const set = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHeader
        kicker="Travel"
        title="Travel requests"
        description="Plan trips, see who needs to approve them, and link approved trips to your expense claims."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => travelApi.exportCsv({ status: status || undefined, scope, search: term || undefined }).catch((e) => toast.error(e.message))}>
              <Download className="h-4 w-4" /> Export
            </button>
            <Link to="/travel/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New request
            </Link>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 2xl:flex-row 2xl:items-center">
          <Tabs
            id="travel-tabs"
            tabs={TABS.map((t) => ({ ...t, count: t.value ? t.value.split(',').reduce((a, s) => a + (counts[s] ?? 0), 0) : undefined }))}
            value={status}
            onChange={(v) => set('status', v)}
          />
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-between 2xl:justify-end">
            {canTeam && <Tabs id="travel-scope" tabs={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: user.role === 'MANAGER' ? 'My team' : 'Everyone' }]} value={scope} onChange={(v) => set('scope', v === 'mine' ? '' : v)} />}
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input h-9 pl-9" placeholder="Search code, title, city…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search travel requests" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows rows={6} />
        ) : !data?.items?.length ? (
          <EmptyState
            icon={Plane}
            title={search || status ? 'No matching requests' : 'No travel requests yet'}
            body={search || status ? 'Try a different filter or search term.' : 'Plan your first trip. We will route it to the right approvers automatically.'}
            action={!search && !status && <Link to="/travel/new" className="btn-primary"><Plus className="h-4 w-4" /> Request travel</Link>}
          />
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            <div className="hidden grid-cols-[1.6fr_1.1fr_0.9fr_0.8fr_1fr_24px] gap-4 border-b border-line bg-subtle/50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted md:grid">
              <span>Trip</span>
              <span>Dates</span>
              <span className="text-right">Estimate</span>
              <span>Policy</span>
              <span>Status</span>
              <span />
            </div>
            <motion.ul variants={list} initial="initial" animate="animate">
              <AnimatePresence initial={false}>
                {data.items.map((t) => (
                  <motion.li key={t.id} variants={item} layout exit="exit">
                    <button type="button" onClick={() => navigate(`/travel/${t.id}`)} className="table-row group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-b border-line/60 px-5 py-3.5 text-left last:border-0 md:grid-cols-[1.6fr_1.1fr_0.9fr_0.8fr_1fr_24px] md:items-center md:gap-4">
                      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3 md:col-start-auto md:row-start-auto">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft to-surface ring-1 ring-line">
                          {t.travelType === 'INTERNATIONAL' ? <Globe2 className="h-[18px] w-[18px] text-brand" /> : <Plane className="h-[18px] w-[18px] text-brand" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium">{t.title}</p>
                          <p className="flex items-center gap-1 truncate text-[12px] text-muted">
                            <span className="font-mono text-[11.5px]">{t.code}</span> · <MapPin className="h-3 w-3" /> {t.origin} → {t.destination}
                          </p>
                        </div>
                      </div>
                      <div className="col-start-1 row-start-2 pl-[52px] text-[12.5px] md:col-start-auto md:row-start-auto md:pl-0">
                        <p>
                          {date(t.startDate, { day: 'numeric', month: 'short' })} – {date(t.endDate)}
                        </p>
                        <p className="text-[11.5px] text-muted">
                          {nights(t.startDate, t.endDate)} nights
                          {scope !== 'mine' && (
                            <span className="ml-1 inline-flex items-center gap-1">
                              · <Avatar name={t.requester.name} size={14} /> {t.requester.name}
                            </span>
                          )}
                        </p>
                      </div>
                      <p className="num text-[13.5px] font-semibold col-start-2 row-start-1 self-center text-right md:col-start-auto md:row-start-auto">{money(t.estTotalBase)}</p>
                      <div className={`col-start-1 row-start-3 pl-[52px] md:col-start-auto md:row-start-auto md:block md:pl-0 ${t.policyFlags?.length ? '' : 'hidden'}`}>{t.policyFlags?.length ? <FlagCount flags={t.policyFlags} /> : <span className="text-[12px] text-muted">In policy</span>}</div>
                      <div className="col-start-2 row-start-2 flex min-w-0 flex-col items-end md:col-start-auto md:row-start-auto md:block">
                        <StatusChip status={t.status} size="sm" />
                        {t.steps?.[0] && <p className="mt-1 truncate text-[11px] text-muted">With {t.steps[0].approver.name}</p>}
                      </div>
                      <ArrowRight className="hidden h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand md:block" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
            <LoadMore shown={paged.items.length} total={paged.total} hasMore={paged.hasNextPage} loading={paged.isFetchingNextPage} onMore={() => paged.fetchNextPage()} noun="requests" />
          </div>
        )}
      </div>
    </div>
  );
}
