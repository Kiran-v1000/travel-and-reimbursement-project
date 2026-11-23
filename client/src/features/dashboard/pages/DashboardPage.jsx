import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Wallet, Hourglass, Plane, Inbox, Landmark, CalendarCheck, ArrowRight, Undo2, FileWarning, PencilLine, PartyPopper, MapPin, Clock3, Receipt, Sparkles } from 'lucide-react';
import { useAppStore, hasRole } from '../../../app/store.js';
import { Skeleton, EmptyState } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { money, compact, shortDate, ago, nights } from '../../../shared/utils/format.js';
import { list, item } from '../../../shared/lib/motion.js';
import { dashboardApi } from '../api/dashboardApi.js';
import { KpiCard } from '../components/KpiCard.jsx';
import { SpendChart } from '../components/SpendChart.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const ATTN = {
  RETURNED: [Undo2, 'bg-warn/10 text-warn'],
  RECEIPT: [FileWarning, 'bg-bad/10 text-bad'],
  DRAFT: [PencilLine, 'bg-brand/10 text-brand'],
};

export function DashboardPage() {
  const user = useAppStore((s) => s.user);
  const navigate = useNavigate();
  const { data: d, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.get });
  const isFinance = hasRole(user, 'FINANCE', 'ADMIN');
  const openTrips = (d?.travel?.PENDING ?? 0) + (d?.travel?.APPROVED ?? 0);

  return (
    <div>
      <div className="relative mb-7 overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_220px_at_100%_0%,rgb(var(--brand)/0.12),transparent),radial-gradient(400px_200px_at_0%_100%,rgb(139_92_246/0.08),transparent)]" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="kicker">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight md:text-[30px]">
              {greeting()}, {user?.name.split(' ')[0]}
            </h1>
            <p className="mt-1 text-[14px] text-muted">
              {d?.approvals?.pending
                ? `You have ${d.approvals.pending} approval${d.approvals.pending > 1 ? 's' : ''} waiting${d.approvals.overdue ? `, ${d.approvals.overdue} overdue` : ''}.`
                : d?.attention?.length
                  ? `${d.attention.length} item${d.attention.length > 1 ? 's need' : ' needs'} your attention.`
                  : 'Everything is on track. Nice work.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/travel/new" className="btn-secondary">
              <Plane className="h-4 w-4" /> Request travel
            </Link>
            <Link to="/expenses/new" className="btn-primary">
              <Receipt className="h-4 w-4" /> New expense
            </Link>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <motion.div variants={list} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Hourglass} tone="warn" label="Awaiting reimbursement" value={d.awaitingReimbursement} format={(n) => money(n)} sub="In approval, Finance or scheduled" onClick={() => navigate('/expenses')} />
          <KpiCard icon={Wallet} tone="ok" label="Reimbursed this year" value={d.reimbursedYtd} format={(n) => money(n)} sub="Paid to your account" onClick={() => navigate('/expenses?status=PAID')} />
          <KpiCard icon={Plane} tone="info" label="Active trips" value={openTrips} sub={`${d?.travel?.PENDING ?? 0} awaiting approval`} onClick={() => navigate('/travel')} />
          {isFinance ? (
            <KpiCard icon={Landmark} tone="brand" label="Finance queue" value={d.finance?.queueCount ?? 0} sub={`${money(d.finance?.queueAmount ?? 0)} to review`} onClick={() => navigate('/finance')} />
          ) : (
            <KpiCard icon={Inbox} tone="brand" label="Approvals waiting" value={d.approvals.pending} sub={d.approvals.overdue ? `${d.approvals.overdue} overdue` : 'Nothing overdue'} onClick={() => navigate('/approvals')} />
          )}
        </motion.div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section className="card p-5 md:p-6">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-[15px] font-semibold">Spend trend</h2>
                <p className="text-[12.5px] text-muted">{user?.role === 'EMPLOYEE' ? 'Your claims' : hasRole(user, 'FINANCE', 'ADMIN', 'AUDITOR') ? 'Organisation-wide' : 'You and your team'} · last 6 months</p>
              </div>
              {d && <p className="num text-[20px] font-semibold tracking-tight">{compact(d.trend.reduce((a, t) => a + t.total, 0))}</p>}
            </div>
            {isLoading ? <Skeleton className="h-[220px]" /> : <SpendChart trend={d.trend} />}
          </section>

          {d?.approvals?.items?.length > 0 && (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold">Waiting for your approval</h2>
                <Link to="/approvals" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                  Open inbox <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <motion.ul variants={list} initial="initial" animate="animate">
                {d.approvals.items.map((s) => (
                  <motion.li variants={item} key={s.id}>
                    <Link to={`/approvals?focus=${s.id}`} className="table-row flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
                      <Avatar name={s.entity.requester.name} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{s.entity.title}</p>
                        <p className="truncate text-[12px] text-muted">
                          {s.entity.requester.name} · {s.entity.code} · {s.label}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num text-[13px] font-semibold">{money(s.entity.amount)}</p>
                        <p className={clsx('text-[11.5px]', s.dueAt && new Date(s.dueAt) < new Date() ? 'font-medium text-bad' : 'text-muted')}>{ago(s.activatedAt)}</p>
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Needs your attention</h2>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : d.attention.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl bg-ok/[0.07] p-3.5">
                <PartyPopper className="h-5 w-5 text-ok" />
                <p className="text-[13px]">You&apos;re all caught up.</p>
              </div>
            ) : (
              <motion.ul variants={list} initial="initial" animate="animate" className="space-y-2">
                {d.attention.map((a, i) => {
                  const [Icon, tone] = ATTN[a.kind] ?? ATTN.DRAFT;
                  return (
                    <motion.li variants={item} key={i}>
                      <Link to={a.link} className="group flex items-center gap-3 rounded-xl border border-line p-3 transition-all hover:border-brand/30 hover:bg-subtle/60">
                        <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{a.label}</span>
                          <span className="block truncate text-[12px] text-muted">{a.detail}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                      </Link>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Upcoming trips</h2>
            {d?.upcoming?.length ? (
              <ul className="space-y-2.5">
                {d.upcoming.map((t) => (
                  <li key={t.id}>
                    <Link to={`/travel/${t.id}`} className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-subtle">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft to-surface ring-1 ring-line">
                        <span className="text-[10px] font-semibold uppercase text-brand">{new Date(t.startDate).toLocaleDateString('en-IN', { month: 'short' })}</span>
                        <span className="num text-[16px] font-bold leading-none">{new Date(t.startDate).getDate()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{t.title}</p>
                        <p className="flex items-center gap-1 truncate text-[12px] text-muted">
                          <MapPin className="h-3 w-3" /> {t.destination} · {nights(t.startDate, t.endDate)} nights
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarCheck} title="No upcoming trips" body="Approved trips will show here." />
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <Sparkles className="h-4 w-4 text-brand" /> Recent activity
            </h2>
            <ul className="space-y-3">
              {(d?.recent ?? []).map((n) => (
                <li key={n.id} className="flex gap-3">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                  <div className="min-w-0">
                    {n.link ? (
                      <Link to={n.link} className="text-[12.5px] font-medium hover:text-brand">
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-[12.5px] font-medium">{n.title}</p>
                    )}
                    <p className="text-[11.5px] text-muted">
                      {ago(n.createdAt)} · {shortDate(n.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
              {d && !d.recent.length && <p className="text-[12.5px] text-muted">No activity yet.</p>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
