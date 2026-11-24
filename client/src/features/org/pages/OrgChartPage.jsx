import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowUpToLine, Building2, ChevronUp, Crown, Mail, MapPin, Search, UserRound, Users } from 'lucide-react';
import { PageHeader, Skeleton, EmptyState } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { UserPicker } from '../../../shared/components/UserPicker.jsx';
import { ease } from '../../../shared/lib/motion.js';
import { orgApi } from '../api/orgApi.js';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN');
const teamText = (p) => (p.teamSize ? `${fmt(p.directs)} direct · ${fmt(p.teamSize)} in team` : 'Individual contributor');

/** A vertical connector between levels of the chart. */
const Line = ({ className }) => <div aria-hidden className={clsx('mx-auto w-px bg-gradient-to-b from-line to-brand/40', className)} />;

function PersonButton({ p, onOpen, compact }) {
  return (
    <motion.button
      type="button"
      layout
      onClick={() => onOpen(p.id)}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease }}
      className={clsx('card group flex w-full items-center gap-3 text-left transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-brand', compact ? 'px-3.5 py-2.5' : 'p-3.5')}
      aria-label={`${p.name}, ${p.title ?? 'no title'}. ${teamText(p)}. Open in org chart`}
    >
      <Avatar name={p.name} size={compact ? 32 : 40} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
          <span className="truncate">{p.name}</span>
          {p.isDeptHead && <Crown className="h-3.5 w-3.5 shrink-0 text-warn" aria-label="Department head" />}
        </p>
        <p className="truncate text-[12px] text-muted">{p.title ?? '—'}{p.department ? ` · ${p.department.name}` : ''}</p>
      </div>
      {p.teamSize > 0 && (
        <span className="num shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11.5px] font-medium text-brand" title={teamText(p)}>
          <Users className="mr-1 inline h-3 w-3" />{fmt(p.teamSize)}
        </span>
      )}
    </motion.button>
  );
}

function FocusCard({ data }) {
  const p = data.person;
  const manager = data.chain[data.chain.length - 1];
  const badge = { SELF: 'You', IN_MY_TEAM: 'In your team', MY_MANAGER_LINE: 'Your management line' }[data.relation];
  return (
    <motion.div
      key={p.id}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.26, ease }}
      className="card relative mx-auto w-full max-w-xl overflow-hidden p-5 ring-2 ring-brand/40"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-brand/15 via-violet-500/10 to-transparent" />
      <div className="relative flex items-start gap-4">
        <Avatar name={p.name} size={60} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[19px] font-semibold tracking-tight">{p.name}</h2>
            {badge && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{badge}</span>}
            {p.isDeptHead && <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn"><Crown className="h-3 w-3" /> Department head</span>}
            {!p.active && <span className="rounded-full bg-bad/10 px-2 py-0.5 text-[11px] font-semibold text-bad">Inactive</span>}
          </div>
          <p className="text-[13.5px] text-muted">{p.title ?? '—'}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
            {p.department && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{p.department.name}</span>}
            {p.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.location}</span>}
            <span className="inline-flex items-center gap-1 font-mono"><UserRound className="h-3.5 w-3.5" />{p.employeeId}</span>
            <a href={`mailto:${p.email}`} className="inline-flex min-h-6 items-center gap-1 text-brand hover:underline"><Mail className="h-3.5 w-3.5" />{p.email}</a>
          </div>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-subtle/60 p-3 text-center">
        <div><p className="num text-[18px] font-semibold">{fmt(p.directs)}</p><p className="text-[11.5px] text-muted">Direct reports</p></div>
        <div><p className="num text-[18px] font-semibold">{fmt(p.teamSize)}</p><p className="text-[11.5px] text-muted">Whole team</p></div>
        <div><p className="num text-[18px] font-semibold">{data.chain.length}</p><p className="text-[11.5px] text-muted">Levels from top</p></div>
      </div>
      {manager && (
        <p className="relative mt-3 text-[12.5px] text-muted">
          Travel and expense requests from {data.isViewer ? 'you' : p.name.split(' ')[0]} go to <span className="font-medium text-ink">{manager.name}</span> first.
        </p>
      )}
    </motion.div>
  );
}

export function OrgChartPage() {
  const [params, setParams] = useSearchParams();
  const focus = params.get('u');
  const open = (id) => {
    setParams(id ? { u: id } : {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [showAllChain, setShowAllChain] = useState(false);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    setShowAllChain(false);
    setFilter('');
  }, [focus]);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['org', 'chart', focus],
    queryFn: () => orgApi.chart(focus),
    placeholderData: keepPreviousData,
  });
  const top = useQuery({ queryKey: ['org', 'roots'], queryFn: orgApi.roots, staleTime: 60_000 });

  const chain = data?.chain ?? [];
  const visibleChain = showAllChain || chain.length <= 4 ? chain : [chain[0], null, ...chain.slice(-2)];
  const reports = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!data || !q) return data?.reports ?? [];
    return data.reports.filter((r) => `${r.name} ${r.title ?? ''} ${r.department?.name ?? ''}`.toLowerCase().includes(q));
  }, [data, filter]);

  return (
    <div>
      <PageHeader
        kicker="Directory"
        title="Org chart"
        description="Who reports to whom. Click anyone to move through the organisation."
        actions={
          <>
            <div className="w-full sm:w-72"><UserPicker value={null} onChange={(id) => id && open(id)} placeholder="Find someone…" ariaLabel="Find a person in the org chart" allowClear={false} /></div>
            <button type="button" className="btn-secondary" onClick={() => open(null)}><UserRound className="h-4 w-4" /> Me</button>
            {top.data?.[0] && <button type="button" className="btn-secondary" onClick={() => open(top.data[0].id)}><ArrowUpToLine className="h-4 w-4" /> Top</button>}
          </>
        }
      />

      {isLoading ? (
        <div className="mx-auto max-w-xl space-y-3"><Skeleton className="h-14 rounded-2xl" /><Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-32 rounded-2xl" /></div>
      ) : isError ? (
        <EmptyState icon={Users} title="Couldn't load the org chart" body={error.message} />
      ) : (
        <div className={clsx('transition-opacity', isFetching && 'opacity-70')} aria-busy={isFetching}>
          {/* Management chain, top first */}
          {chain.length > 0 && (
            <nav aria-label="Management chain" className="mx-auto max-w-md">
              <ol>
                {visibleChain.map((m, i) => (
                  <li key={m?.id ?? 'more'}>
                    {m ? (
                      <PersonButton p={m} onOpen={open} compact />
                    ) : (
                      <button type="button" onClick={() => setShowAllChain(true)} className="btn-ghost mx-auto flex h-8 text-[12.5px]">
                        <ChevronUp className="h-3.5 w-3.5" /> {chain.length - 3} more managers
                      </button>
                    )}
                    <Line className="h-5" />
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <AnimatePresence mode="wait"><FocusCard key={data.person.id} data={data} /></AnimatePresence>

          {/* Direct reports */}
          {data.reportTotal > 0 && (
            <section aria-label={`Direct reports of ${data.person.name}`} className="mt-0">
              <Line className="h-6" />
              <div className="mx-auto mb-4 h-px w-full max-w-5xl bg-gradient-to-r from-transparent via-line to-transparent" aria-hidden />
              <div className="mx-auto mb-3 flex max-w-5xl flex-wrap items-center gap-3">
                <h3 className="text-[14px] font-semibold">Direct reports <span className="text-muted">· {fmt(data.reportTotal)}</span></h3>
                {data.reports.length > 12 && (
                  <label className="relative ml-auto w-full sm:w-64">
                    <span className="sr-only">Filter direct reports</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input className="input pl-9" placeholder="Filter by name, title, department" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  </label>
                )}
              </div>
              <motion.ul
                key={data.person.id}
                initial="initial"
                animate="animate"
                variants={{ animate: { transition: { staggerChildren: Math.min(0.03, 0.6 / Math.max(reports.length, 1)) } } }}
                className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {reports.map((r) => (
                  <motion.li key={r.id} variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease } } }}>
                    <PersonButton p={r} onOpen={open} />
                  </motion.li>
                ))}
              </motion.ul>
              {!reports.length && <p className="mx-auto max-w-5xl text-[13px] text-muted">No one matches “{filter}”.</p>}
              {data.reportTotal > data.reports.length && (
                <p className="mx-auto mt-3 max-w-5xl text-[12px] text-muted">Showing the first {fmt(data.reports.length)} of {fmt(data.reportTotal)} direct reports (A–Z). Use “Find someone” to jump to anyone else.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
