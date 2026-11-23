import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Inbox, CheckCheck, Plane, Receipt, Keyboard, Clock, PartyPopper, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Tabs, SkeletonRows, EmptyState, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { StatusChip } from '../../../shared/components/ui/StatusChip.jsx';
import { FlagCount } from '../../../shared/components/PolicyFlags.jsx';
import { ReasonDialog } from '../../../shared/components/ReasonDialog.jsx';
import { useInbox, useHotkeys } from '../../../shared/hooks/index.js';
import { money, ago, dateTime } from '../../../shared/utils/format.js';
import { item } from '../../../shared/lib/motion.js';
import { approvalsApi } from '../api/approvalsApi.js';
import { ReviewPane } from '../components/ReviewPane.jsx';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'EXPENSE', label: 'Expenses' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'delegated', label: 'Delegated' },
];

export function ApprovalsPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [view, setView] = useState('inbox');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(params.get('focus'));
  const [checked, setChecked] = useState(new Set());
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: inbox = [], isLoading } = useInbox();
  const { data: history = [], isLoading: loadingHistory } = useQuery({ queryKey: ['approvals', 'history'], queryFn: approvalsApi.history, enabled: view === 'history' });

  const items = useMemo(
    () =>
      inbox.filter((s) =>
        filter === 'all' ? true : filter === 'flagged' ? s.entity.flags?.length > 0 : filter === 'delegated' ? !!s.onBehalfOf : s.entity.type === filter,
      ),
    [inbox, filter],
  );
  const current = items.find((s) => s.id === selected) ?? items[0];
  const idx = current ? items.indexOf(current) : -1;

  useEffect(() => {
    if (current && current.id !== selected) setSelected(current.id);
  }, [current, selected]);

  const refresh = () => ['approvals', 'travel', 'expenses', 'dashboard', 'notifications', 'finance'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  async function decide(action, comment) {
    if (!current) return;
    const target = current;
    setBusy(true);
    try {
      await approvalsApi.act(target.id, action, comment);
      // Optimistically drop the row and move to the next one.
      qc.setQueryData(['approvals', 'inbox'], (old = []) => old.filter((s) => s.id !== target.id));
      setSelected(items[idx + 1]?.id ?? items[idx - 1]?.id ?? null);
      toast.success(`${target.entity.code} ${{ APPROVED: 'approved', RETURNED: 'returned', REJECTED: 'rejected' }[action]}`);
      setDialog(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function bulk() {
    setBusy(true);
    try {
      const res = await approvalsApi.bulkApprove([...checked]);
      const failed = res.results.filter((r) => !r.ok);
      toast.success(`${res.approved} item${res.approved === 1 ? '' : 's'} approved`, failed.length ? { description: `${failed.length} could not be approved: ${failed[0].error}` } : undefined);
      setChecked(new Set());
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  useHotkeys(
    {
      j: () => items[idx + 1] && setSelected(items[idx + 1].id),
      arrowdown: () => items[idx + 1] && setSelected(items[idx + 1].id),
      k: () => items[idx - 1] && setSelected(items[idx - 1].id),
      arrowup: () => items[idx - 1] && setSelected(items[idx - 1].id),
      a: () => current && setDialog('APPROVED'),
      r: () => current && setDialog('RETURNED'),
      x: () => current && setDialog('REJECTED'),
    },
    [items, idx, current],
  );

  const toggle = (id) =>
    setChecked((c) => {
      const n = new Set(c);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div>
      <PageHeader
        kicker="Approvals"
        title={view === 'inbox' ? 'Your approval inbox' : 'Decision history'}
        description="Review requests in order. Use J / K to move between items, then A to approve, R to return or X to reject."
        actions={<Tabs id="appr-view" value={view} onChange={setView} tabs={[{ value: 'inbox', label: 'Inbox', count: inbox.length }, { value: 'history', label: 'History' }]} />}
      />

      {view === 'history' ? (
        <div className="card overflow-hidden">
          {loadingHistory ? (
            <SkeletonRows />
          ) : !history.length ? (
            <EmptyState icon={Clock} title="No decisions yet" body="Items you approve, return or reject will appear here." />
          ) : (
            <ul>
              {history.map((s) => (
                <li key={s.id}>
                  <Link to={s.entity.link} className="table-row flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
                    <Avatar name={s.entity.requester.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{s.entity.title}</p>
                      <p className="truncate text-[12px] text-muted">{s.entity.code} · {s.entity.requester.name} · {s.label}{s.comment && ` · “${s.comment}”`}</p>
                    </div>
                    <span className="num hidden text-[13px] font-medium sm:block">{money(s.entity.amount)}</span>
                    <StatusChip status={s.status} size="sm" />
                    <span className="hidden w-28 text-right text-[11.5px] text-muted md:block">{dateTime(s.actedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : isLoading ? (
        <div className="card"><SkeletonRows rows={5} /></div>
      ) : !inbox.length ? (
        <div className="card">
          <EmptyState icon={PartyPopper} title="You're all caught up" body="New requests that need your approval will land here, and we'll notify you." />
        </div>
      ) : (
        <div className="card grid overflow-hidden lg:h-[calc(100vh-220px)] lg:min-h-[560px] lg:grid-cols-[380px_1fr]">
          <div className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
            <div className="border-b border-line p-3">
              <Tabs id="appr-filter" value={filter} onChange={setFilter} tabs={FILTERS.map((f) => ({ ...f, count: f.value === 'all' ? undefined : inbox.filter((s) => (f.value === 'flagged' ? s.entity.flags?.length : f.value === 'delegated' ? s.onBehalfOf : s.entity.type === f.value)).length }))} />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Pending approvals">
              <AnimatePresence initial={false}>
                {items.map((s) => {
                  const overdue = s.dueAt && new Date(s.dueAt) < new Date();
                  const active = current?.id === s.id;
                  return (
                    <motion.li key={s.id} layout variants={item} initial="initial" animate="animate" exit="exit" role="option" aria-selected={active}>
                      <div className={clsx('relative flex cursor-pointer items-start gap-3 border-b border-line/60 px-4 py-3.5 transition-colors', active ? 'bg-brand/[0.06]' : 'hover:bg-subtle/60')} onClick={() => setSelected(s.id)}>
                        {active && <motion.span layoutId="appr-active" className="absolute inset-y-0 left-0 w-[3px] bg-brand" />}
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded accent-[rgb(var(--brand))]"
                          checked={checked.has(s.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(s.id)}
                          aria-label={`Select ${s.entity.code}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {s.entity.type === 'TRAVEL' ? <Plane className="h-3.5 w-3.5 shrink-0 text-brand" /> : <Receipt className="h-3.5 w-3.5 shrink-0 text-brand" />}
                            <p className="truncate text-[13px] font-medium">{s.entity.title}</p>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-muted">{s.entity.requester.name} · {s.entity.subtitle}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <FlagCount flags={s.entity.flags} />
                            {s.onBehalfOf && <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10.5px] font-medium text-brand-ink"><UserCheck className="h-3 w-3" /> for {s.onBehalfOf.name.split(' ')[0]}</span>}
                            <span className={clsx('text-[11px]', overdue ? 'font-semibold text-bad' : 'text-muted')}>{overdue ? 'Overdue · ' : ''}{ago(s.activatedAt)}</span>
                          </div>
                        </div>
                        <span className="num text-[13px] font-semibold">{money(s.entity.amount)}</span>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {!items.length && <p className="p-6 text-center text-[13px] text-muted">Nothing in this filter.</p>}
            </ul>
            <p className="hidden items-center gap-1.5 border-t border-line px-4 py-2 text-[11px] text-muted lg:flex">
              <Keyboard className="h-3.5 w-3.5" /> J/K move · A approve · R return · X reject
            </p>
          </div>
          <div className="min-h-[480px]">{current ? <ReviewPane step={current} onDecide={setDialog} /> : <EmptyState icon={Inbox} title="Select an item" />}</div>
        </div>
      )}

      <AnimatePresence>
        {checked.size > 0 && view === 'inbox' && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-[min(520px,calc(100vw-24px))] items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-5 shadow-2xl">
            <p className="flex-1 text-[13px]"><span className="font-semibold">{checked.size}</span> selected · {money(inbox.filter((s) => checked.has(s.id)).reduce((a, s) => a + s.entity.amount, 0))}</p>
            <button type="button" className="btn-ghost" onClick={() => setChecked(new Set())}>Clear</button>
            <button type="button" className="btn-success" onClick={bulk} disabled={busy}>{busy ? <Spinner /> : <CheckCheck className="h-4 w-4" />} Approve all</button>
          </motion.div>
        )}
      </AnimatePresence>

      <ReasonDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        busy={busy}
        required={dialog !== 'APPROVED'}
        title={{ APPROVED: `Approve ${current?.entity.code ?? ''}?`, RETURNED: 'Return for changes', REJECTED: 'Reject this request' }[dialog] ?? ''}
        description={current ? `${current.entity.title} · ${money(current.entity.amount)}` : ''}
        confirmLabel={{ APPROVED: 'Approve', RETURNED: 'Return', REJECTED: 'Reject' }[dialog]}
        tone={{ APPROVED: 'success', RETURNED: 'warn', REJECTED: 'danger' }[dialog]}
        onConfirm={(c) => decide(dialog, c)}
      />
    </div>
  );
}
