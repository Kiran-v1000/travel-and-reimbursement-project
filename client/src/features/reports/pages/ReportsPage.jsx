import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Download, IndianRupee, Plane, Inbox, ShieldAlert, Undo2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, hasRole } from '../../../app/store.js';
import { PageHeader, Skeleton, AnimatedNumber } from '../../../shared/components/ui/primitives.jsx';
import { StatusChip } from '../../../shared/components/ui/StatusChip.jsx';
import { money, compact, isoDay, ago } from '../../../shared/utils/format.js';
import { list, item } from '../../../shared/lib/motion.js';
import { reportsApi } from '../api/reportsApi.js';

const COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#64748b', '#ef4444'];
const axis = { tickLine: false, axisLine: false, tick: { fill: 'rgb(var(--muted))', fontSize: 11.5 } };

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="text-[11.5px] text-muted">{label ?? payload[0].payload.label}</p>
      <p className="num text-[13.5px] font-semibold">{money(payload[0].value)}</p>
    </div>
  );
}

function Panel({ title, action, children, className }) {
  return (
    // min-w-0: a grid item may shrink below its content, so wide tables scroll inside the card.
    <motion.section variants={item} className={clsx('card min-w-0 p-5', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[14.5px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

const PRESETS = [
  { value: 'ytd', label: 'Year to date', from: () => `${new Date().getFullYear()}-01-01` },
  { value: '90', label: 'Last 90 days', from: () => isoDay(new Date(Date.now() - 90 * 86400000)) },
  { value: '30', label: 'Last 30 days', from: () => isoDay(new Date(Date.now() - 30 * 86400000)) },
];

export function ReportsPage() {
  const user = useAppStore((s) => s.user);
  const [preset, setPreset] = useState('ytd');
  const params = { from: PRESETS.find((p) => p.value === preset).from(), to: isoDay(new Date()) };
  const { data: a, isLoading, isFetching } = useQuery({ queryKey: ['reports', params], queryFn: () => reportsApi.analytics(params), placeholderData: keepPreviousData,
    // A stored result is being refreshed on the server: pick up the new one when it lands.
    refetchInterval: (q) => (q.state.data?.refreshing ? 4000 : false),
  });
  const exp = (kind) => reportsApi.exportCsv(kind, params).catch((e) => toast.error(e.message));
  const scope = hasRole(user, 'FINANCE', 'ADMIN', 'AUDITOR') ? 'Whole organisation' : 'You and your reporting line';

  return (
    <div>
      <PageHeader
        kicker="Reports"
        title="Spend analytics"
        description={`${scope}. Exports follow the same access rules as this page.`}
        children={a?.computedAt && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-muted" title={new Date(a.computedAt).toLocaleString('en-IN')}>
            <RefreshCw className={clsx('h-3 w-3', isFetching && 'animate-spin')} aria-hidden /> {a.refreshing ? `Showing figures from ${ago(a.computedAt)} · updating…` : `Updated ${ago(a.computedAt)}`}
          </p>
        )}
        actions={
          <div className="inline-flex rounded-xl bg-subtle p-1">
            {PRESETS.map((p) => (
              <button key={p.value} type="button" onClick={() => setPreset(p.value)} className={clsx('h-8 rounded-lg px-3 text-[12.5px] font-medium transition-all', preset === p.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}>
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading || !a ? (
        <div className="grid gap-4 md:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : (
        <motion.div variants={list} initial="initial" animate="animate" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Claimed spend', v: a.kpis.totalSpend, f: (n) => compact(n), icon: IndianRupee },
              { label: 'Trip estimates', v: a.kpis.travelEstimate, f: (n) => compact(n), icon: Plane, sub: `${a.kpis.trips} trips` },
              { label: 'Open approvals', v: a.kpis.openApprovals, icon: Inbox },
              { label: 'Policy exceptions', v: a.kpis.exceptions, icon: ShieldAlert },
              { label: 'Returned / rejected', v: a.kpis.returnedRejected, icon: Undo2 },
            ].map((k) => (
              <motion.div key={k.label} variants={item} className="card p-4">
                <div className="flex items-center justify-between text-[12px] text-muted">{k.label}<k.icon className="h-4 w-4" /></div>
                <p className="mt-2 text-[22px] font-semibold tracking-tight"><AnimatedNumber value={k.v} format={k.f} /></p>
                {k.sub && <p className="text-[11.5px] text-muted">{k.sub}</p>}
              </motion.div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Panel title="Spend by month">
              {/* Screen readers get the figures as text; the drawing itself is hidden from them. */}
              <div className="h-[260px]" role="img" aria-label={`Spend by month: ${a.byMonth.map((m) => `${new Date(`${m.label}-01`).toLocaleDateString('en-IN', { month: 'long' })} ${money(m.total)}`).join(', ') || 'no spend in this period'}`}>
                <div className="h-full" aria-hidden="true">
                <ResponsiveContainer>
                  <BarChart data={a.byMonth} margin={{ left: -8, right: 4 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 4" />
                    <XAxis dataKey="label" {...axis} tickFormatter={(m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short' })} />
                    <YAxis {...axis} tickFormatter={(v) => compact(v)} width={60} />
                    <Tooltip content={<Tip />} cursor={{ fill: 'rgb(var(--brand) / 0.06)' }} />
                    <Bar dataKey="total" fill="rgb(var(--brand))" radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </Panel>
            <Panel title="By category" action={<button type="button" className="btn-ghost h-8 text-[12px]" onClick={() => exp('categories')}><Download className="h-3.5 w-3.5" /> CSV</button>}>
              <div className="flex items-center gap-4">
                {/* Decorative: the legend next to it lists every category with its amount. */}
                <div className="h-[200px] w-[200px] shrink-0" aria-hidden="true">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie rootTabIndex={-1} data={a.byCategory} dataKey="total" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none" animationDuration={800}>
                        {a.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {a.byCategory.slice(0, 7).map((c, i) => (
                    <li key={c.label} className="flex items-center gap-2 text-[12.5px]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 truncate">{c.label}</span>
                      <span className="num font-medium">{compact(c.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {[['By department', a.byDepartment], ['By cost center', a.byCostCenter], ['Reimbursement aging', a.reimbursementAging]].map(([title, rows]) => (
              <Panel key={title} title={title}>
                <ul className="space-y-3">
                  {rows.map((r, i) => {
                    const max = Math.max(...rows.map((x) => Number(x.total)), 1);
                    return (
                      <li key={r.label}>
                        <div className="mb-1 flex justify-between text-[12.5px]"><span>{r.label}</span><span className="num font-medium">{money(r.total)}</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-subtle">
                          <motion.div className="h-full rounded-full" style={{ background: COLORS[i % COLORS.length] }} initial={{ width: 0 }} animate={{ width: `${(Number(r.total) / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }} />
                        </div>
                      </li>
                    );
                  })}
                  {!rows.length && <p className="text-[12.5px] text-muted">No data in this range.</p>}
                </ul>
              </Panel>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title={a.openApprovalsTruncated ? `Open approvals - oldest ${a.openApprovals.length} of ${a.kpis.openApprovals.toLocaleString('en-IN')}` : 'Open approvals by age'} action={<button type="button" className="btn-ghost h-8 text-[12px]" onClick={() => exp('approvals')}><Download className="h-3.5 w-3.5" /> CSV</button>}>
              {!a.openApprovals.length ? <p className="text-[12.5px] text-muted">No open approvals.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th className="pb-2 font-semibold">Item</th><th className="pb-2 font-semibold">Approver</th><th className="pb-2 text-right font-semibold">Amount</th><th className="pb-2 text-right font-semibold">Age</th></tr></thead>
                    <tbody>
                      {a.openApprovals.map((o) => (
                        <tr key={o.code + o.approver} className="border-t border-line/60">
                          <td className="py-2"><span className="font-mono">{o.code}</span><span className="block text-[11.5px] text-muted">{o.requester} · {o.department}</span></td>
                          <td className="py-2">{o.approver}</td>
                          <td className="num py-2 text-right">{money(o.amount)}</td>
                          <td className={clsx('num py-2 text-right', o.overdue && 'font-semibold text-bad')}>{o.ageDays}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="Policy exceptions" action={<button type="button" className="btn-ghost h-8 text-[12px]" onClick={() => exp('exceptions')}><Download className="h-3.5 w-3.5" /> CSV</button>}>
              {!a.exceptions.length ? <p className="text-[12.5px] text-muted">No exceptions in scope.</p> : (
                <ul className="space-y-2">
                  {a.exceptions.slice(0, 8).map((x) => (
                    <li key={x.id}>
                      <Link to={`/expenses/${x.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-[12.5px] hover:border-brand/30 hover:bg-subtle/60">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-warn" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{x.code} · {x.employee.name}</span>
                          <span className="block truncate text-muted">{x.policyFlags.map((f) => f.message).join(' · ')}</span>
                        </span>
                        <StatusChip status={x.status} size="sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {a.byCurrency.length > 1 && (
            <Panel title="Spend by original currency">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {a.byCurrency.map((c) => (
                  <div key={c.label} className="rounded-xl bg-subtle p-3">
                    <p className="text-[11.5px] text-muted">{c.label}</p>
                    <p className="num text-[15px] font-semibold">{money(c.original, c.label)}</p>
                    <p className="num text-[11.5px] text-muted">≈ {money(c.total)}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </motion.div>
      )}
    </div>
  );
}
