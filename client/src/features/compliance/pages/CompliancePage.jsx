import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Archive, CalendarClock, FileX2, Lock, LockOpen, Play, ShieldAlert, HardDrive } from 'lucide-react';
import { PageHeader, Tabs, SkeletonRows, EmptyState, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { ReasonDialog } from '../../../shared/components/ReasonDialog.jsx';
import { useAppStore, hasRole } from '../../../app/store.js';
import { date, dateTime, bytes } from '../../../shared/utils/format.js';
import { list, item } from '../../../shared/lib/motion.js';
import { adminApi } from '../../admin/api/adminApi.js';
import { complianceApi } from '../api/complianceApi.js';
import { PlaceHoldDialog } from '../components/PlaceHoldDialog.jsx';

const SCOPE_LABEL = { EMPLOYEE: 'Employee', EXPENSE: 'Expense report', TRAVEL: 'Trip', PERIOD: 'Date range' };
const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN');

export function CompliancePage() {
  const user = useAppStore((s) => s.user);
  const isAdmin = hasRole(user, 'ADMIN');
  const canHold = hasRole(user, 'ADMIN', 'FINANCE');
  const qc = useQueryClient();
  const [tab, setTab] = useState('ACTIVE');
  const [placing, setPlacing] = useState(false);
  const [releasing, setReleasing] = useState(null);
  const [confirmRun, setConfirmRun] = useState(false);

  const runs = useQuery({
    queryKey: ['compliance', 'runs'],
    queryFn: complianceApi.runs,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'RUNNING') ? 2000 : false),
  });
  const running = runs.data?.some((r) => r.status === 'RUNNING');
  const retention = useQuery({ queryKey: ['compliance', 'retention', running], queryFn: complianceApi.retention });
  const holds = useQuery({ queryKey: ['compliance', 'holds', tab], queryFn: () => complianceApi.holds(tab) });

  const refresh = () => qc.invalidateQueries({ queryKey: ['compliance'] });
  const start = useMutation({
    mutationFn: complianceApi.startRun,
    onSuccess: () => { toast.success('Retention run started'); setConfirmRun(false); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleAuto = useMutation({
    mutationFn: (on) => adminApi.saveSettings({ retentionAutoPurge: on }),
    onSuccess: (_d, on) => { toast.success(on ? 'Nightly purge switched on' : 'Nightly purge switched off'); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const release = useMutation({
    mutationFn: ({ id, reason }) => complianceApi.releaseHold(id, reason),
    onSuccess: () => { toast.success('Hold released'); setReleasing(null); refresh(); },
    onError: (e) => toast.error(e.fields?.reason?.[0] ?? e.message),
  });

  const r = retention.data;
  const total = r ? r.expenses.records + r.trips.records : 0;
  const held = r ? r.expenses.held + r.trips.held : 0;

  return (
    <div>
      <PageHeader
        kicker="Compliance"
        title="Retention & legal holds"
        description="Closed records are kept for the retention period, then their receipts and personal details are removed. Records under legal hold are never touched."
        actions={canHold && <button type="button" className="btn-primary" onClick={() => setPlacing(true)}><Lock className="h-4 w-4" /> Place legal hold</button>}
      />

      {/* Retention summary */}
      <motion.div variants={list} initial="initial" animate="animate" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: CalendarClock, tone: 'text-brand bg-brand/10', label: 'Retention period', value: r ? `${r.years} years` : '—', sub: r ? `Records closed before ${date(r.cutoff)}` : '' },
          { icon: Archive, tone: 'text-warn bg-warn/10', label: 'Due for purge now', value: r ? fmt(total) : '—', sub: r ? `${fmt(r.expenses.records)} reports · ${fmt(r.trips.records)} trips` : '' },
          { icon: HardDrive, tone: 'text-info bg-info/10', label: 'Receipts to delete', value: r ? fmt(r.expenses.files + r.trips.files) : '—', sub: r ? bytes(r.expenses.bytes + r.trips.bytes || 1) : '' },
          { icon: ShieldAlert, tone: 'text-bad bg-bad/10', label: 'Protected by holds', value: r ? fmt(held) : '—', sub: 'Past retention, kept for a hold' },
        ].map((k) => (
          <motion.div key={k.label} variants={item} className="card flex items-center gap-4 p-5">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${k.tone}`}><k.icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[12.5px] text-muted">{k.label}</p>
              <p className="text-[22px] font-semibold tracking-tight">{k.value}</p>
              <p className="truncate text-[11.5px] text-muted">{k.sub}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        {/* Purge controls + history */}
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[14.5px] font-semibold">Purge runs</h2>
              <p className="text-[12.5px] text-muted">Codes, dates, amounts and payments are kept so totals and the audit trail still add up.</p>
            </div>
            {isAdmin && (
              <button type="button" className="btn-secondary" disabled={running || !r || total === 0} onClick={() => setConfirmRun(true)}>
                {running ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />} {running ? 'Running…' : 'Run now'}
              </button>
            )}
          </div>
          {r && (
            <label className={`flex items-center gap-3 border-b border-line px-5 py-3 text-[13px] ${isAdmin ? '' : 'opacity-70'}`}>
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={r.autoPurge} disabled={!isAdmin || toggleAuto.isPending} onChange={(e) => toggleAuto.mutate(e.target.checked)} />
              <span><span className="font-medium">Purge automatically every night</span> <span className="text-muted">(02:43). {r.autoPurge ? 'On.' : 'Off — nothing is removed until an administrator runs it.'}</span></span>
            </label>
          )}
          {runs.isLoading ? <SkeletonRows rows={3} /> : !runs.data?.length ? (
            <EmptyState icon={Archive} title="No purge has run yet" body={r?.oldestRecord ? `Oldest record on file: ${date(r.oldestRecord)}.` : undefined} />
          ) : (
            <ul className="divide-y divide-line/60">
              {runs.data.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${x.status === 'DONE' ? 'bg-ok' : x.status === 'FAILED' ? 'bg-bad' : 'animate-pulse bg-warn'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">
                      {fmt(x.expenses)} reports · {fmt(x.trips)} trips · {fmt(x.files)} receipts{x.bytes ? ` (${bytes(x.bytes)})` : ''}
                    </p>
                    <p className="truncate text-[11.5px] text-muted">
                      {x.status === 'RUNNING' ? 'Running' : x.status === 'FAILED' ? `Failed: ${x.error}` : 'Done'} · {x.trigger === 'SCHEDULED' ? 'Nightly' : `Started by ${x.triggeredBy?.name ?? 'System'}`} · {dateTime(x.startedAt)}
                      {x.skippedOnHold ? ` · ${fmt(x.skippedOnHold)} kept for holds` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Holds */}
        <section className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <Tabs id="hold-tabs" value={tab} onChange={setTab} tabs={[{ value: 'ACTIVE', label: 'Active holds' }, { value: 'RELEASED', label: 'Released' }]} />
          </div>
          {holds.isLoading ? <SkeletonRows rows={3} /> : !holds.data?.length ? (
            <EmptyState icon={Lock} title={tab === 'ACTIVE' ? 'No active holds' : 'No released holds'} body={tab === 'ACTIVE' ? 'Place a hold when records must be preserved for an audit, dispute or investigation.' : undefined} />
          ) : (
            <motion.ul variants={list} initial="initial" animate="animate" className="divide-y divide-line/60">
              {holds.data.map((h) => (
                <motion.li key={h.id} variants={item} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${h.releasedAt ? 'bg-subtle text-muted' : 'bg-bad/10 text-bad'}`}>
                    {h.releasedAt ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{h.subject}</p>
                    <p className="text-[12px] text-muted">{SCOPE_LABEL[h.scope]} · {h.reason}{h.reference ? ` · ${h.reference}` : ''}</p>
                    <p className="text-[11.5px] text-muted">
                      Placed by {h.placedBy?.name} · {date(h.placedAt)}
                      {h.releasedAt && ` · released by ${h.releasedBy?.name} on ${date(h.releasedAt)}: ${h.releaseReason}`}
                    </p>
                  </div>
                  {canHold && !h.releasedAt && (
                    <button type="button" className="btn-ghost h-8 px-2.5 text-[12.5px]" onClick={() => setReleasing(h)} aria-label={`Release hold on ${h.subject}`}>
                      <LockOpen className="h-3.5 w-3.5" /> Release
                    </button>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </section>
      </div>

      <PlaceHoldDialog open={placing} onClose={() => setPlacing(false)} />

      <ReasonDialog
        open={!!releasing}
        onClose={() => setReleasing(null)}
        title="Release legal hold"
        description={releasing ? `${releasing.subject} — records go back to the normal retention schedule.` : ''}
        confirmLabel="Release hold"
        tone="warn"
        placeholder="Why can the hold be released? (e.g. audit closed)"
        busy={release.isPending}
        onConfirm={(reason) => release.mutate({ id: releasing.id, reason })}
      />

      <Modal open={confirmRun} onClose={() => setConfirmRun(false)} size="sm" title="Run retention purge now?"
        footer={<><button type="button" className="btn-ghost" onClick={() => setConfirmRun(false)}>Cancel</button>
          <button type="button" className="btn-danger" disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? <Spinner className="h-4 w-4" /> : <FileX2 className="h-4 w-4" />} Purge {fmt(total)} records</button></>}>
        {r && (
          <div className="space-y-3 text-[13px]">
            <p>This permanently deletes <b>{fmt(r.expenses.files + r.trips.files)} receipt files</b> and removes titles, purposes, merchants, notes and comments from <b>{fmt(r.expenses.records)} expense reports</b> and <b>{fmt(r.trips.records)} trips</b> closed before {date(r.cutoff)}.</p>
            <p className="text-muted">Codes, dates, amounts, categories and payments are kept. {held ? `${fmt(held)} records under legal hold are skipped.` : ''} This cannot be undone.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
