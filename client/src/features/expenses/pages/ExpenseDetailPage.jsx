import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowLeft, Plus, Send, Undo, Trash2, Pencil, Paperclip, Plane, Receipt, Wallet, CalendarClock, Landmark, MoreHorizontal, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, hasRole } from '../../../app/store.js';
import { Skeleton, Tabs, Spinner, EmptyState, Field } from '../../../shared/components/ui/primitives.jsx';
import { StatusChip } from '../../../shared/components/ui/StatusChip.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { ApprovalTimeline } from '../../../shared/components/ApprovalTimeline.jsx';
import { PolicyFlags, FlagCount, hasViolation } from '../../../shared/components/PolicyFlags.jsx';
import { RoutePreview } from '../../../shared/components/RoutePreview.jsx';
import { ActivityLog } from '../../../shared/components/ActivityLog.jsx';
import { StageProgress } from '../../../shared/components/StageProgress.jsx';
import { DecisionBar } from '../../../shared/components/DecisionBar.jsx';
import { fileUrl } from '../../../shared/lib/api.js';
import { money, date, dateTime } from '../../../shared/utils/format.js';
import { EXPENSE_STAGES, PAYMENT_METHODS } from '../../../shared/utils/status.js';
import { list, item } from '../../../shared/lib/motion.js';
import { useExpense, useExpensePolicy, useExpenseMutation } from '../hooks/useExpenses.js';
import { expensesApi } from '../api/expensesApi.js';
import { LineEditor } from '../components/LineEditor.jsx';
import { FinancePanel } from '../components/FinancePanel.jsx';
import { CategoryIcon } from '../components/CategoryIcon.jsx';

export function ExpenseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const { data: r, isLoading, error, refetch } = useExpense(id);
  const mine = r?.employeeId === user.id;
  const editable = mine && ['DRAFT', 'RETURNED'].includes(r?.status);
  const { data: policy, refetch: refetchPolicy, isFetching: checking } = useExpensePolicy(id, !!editable);
  const [editor, setEditor] = useState({ open: false, line: null });
  const [tab, setTab] = useState('approvals');
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');
  const submit = useExpenseMutation((x) => expensesApi.submit(id, x));
  const withdraw = useExpenseMutation(() => expensesApi.withdraw(id));
  const remove = useExpenseMutation(() => expensesApi.remove(id));
  const delLine = useExpenseMutation((lineId) => expensesApi.deleteLine(id, lineId));

  if (isLoading) return <Skeleton className="h-[640px] rounded-2xl" />;
  if (error) return <div className="card p-10 text-center text-[14px]">{error.message}</div>;

  const flags = editable ? policy?.flags ?? r.policyFlags : r.policyFlags;
  const exception = hasViolation(flags);
  const total = editable ? policy?.total ?? Number(r.totalBase) : Number(r.totalBase);
  const refresh = () => {
    refetch();
    if (editable) refetchPolicy();
  };
  const isFinance = hasRole(user, 'FINANCE', 'ADMIN') && !mine;
  const returnStep = r.steps.find((s) => s.status === 'RETURNED' && s.round === r.round);
  const est = Number(r.travelRequest?.estTotalBase ?? 0);

  async function doSubmit() {
    try {
      await submit.mutateAsync(reason.trim() || undefined);
      toast.success(`${r.code} submitted`, { description: 'Your approver has been notified.' });
      setConfirm(null);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-[12.5px] text-muted">
        <button type="button" onClick={() => navigate(-1)} className="btn-ghost h-8 px-2"><ArrowLeft className="h-4 w-4" /> Back</button>
        <span>/</span>
        <Link to="/expenses" className="hover:text-ink">Expenses</Link>
        <span>/</span>
        <span className="font-mono text-ink">{r.code}</span>
      </div>

      <DecisionBar steps={r.steps} round={r.round} requesterId={r.employeeId} onDone={refetch} />
      {isFinance && <FinancePanel report={r} onDone={refetch} />}

      {r.status === 'RETURNED' && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/[0.07] p-4 text-[13px]">
          <Undo className="mt-0.5 h-4 w-4 text-warn" />
          <div>
            <p className="font-medium">Returned for changes{returnStep ? ` by ${returnStep.actedBy?.name ?? returnStep.approver.name}` : ' by Finance'}</p>
            <p className="text-ink/80">{returnStep?.comment ?? r.financeNote}</p>
          </div>
        </motion.div>
      )}

      <div className="card mb-6 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={r.employee.name} size={48} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[20px] font-semibold tracking-tight md:text-[22px]">{r.title}</h1>
                <StatusChip status={r.status} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                <span className="font-mono">{r.code}</span>
                <span>{r.employee.name} · {r.employee.department?.name}</span>
                <span>{r.costCenter?.code}{r.projectCode && ` · ${r.projectCode}`}</span>
                {r.travelRequest && (
                  <Link to={`/travel/${r.travelRequest.id}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                    <Plane className="h-3.5 w-3.5" /> {r.travelRequest.code}
                  </Link>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {mine && ['PENDING', 'RETURNED'].includes(r.status) && <button type="button" className="btn-secondary" onClick={() => setConfirm('withdraw')}><Undo className="h-4 w-4" /> Withdraw</button>}
            {mine && r.status === 'DRAFT' && <button type="button" className="btn-ghost text-bad" onClick={() => setConfirm('delete')}><Trash2 className="h-4 w-4" /> Delete draft</button>}
          </div>
        </div>
        <div className="mt-6"><StageProgress stages={EXPENSE_STAGES} status={r.status} /></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold">Expenses</h2>
                <p className="text-[12.5px] text-muted">{r.lines.length} item{r.lines.length === 1 ? '' : 's'} · {r.purpose}</p>
              </div>
              {editable && (
                <button type="button" className="btn-primary" onClick={() => setEditor({ open: true, line: null })}>
                  <Plus className="h-4 w-4" /> Add expense
                </button>
              )}
            </div>
            {r.lines.length === 0 ? (
              <EmptyState icon={Receipt} title="No expenses yet" body="Add each cost with its receipt. We'll check them against policy as you go." action={editable && <button type="button" className="btn-primary" onClick={() => setEditor({ open: true, line: null })}><Plus className="h-4 w-4" /> Add first expense</button>} />
            ) : (
              <motion.ul variants={list} initial="initial" animate="animate">
                <AnimatePresence initial={false}>
                  {r.lines.map((l) => {
                    const lf = (editable ? flags.filter((f) => f.lineId === l.id) : l.flags) ?? [];
                    return (
                      <motion.li key={l.id} variants={item} layout exit="exit" className="group border-b border-line/60 last:border-0">
                        <div className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-subtle/50">
                          <CategoryIcon icon={l.category.icon} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-[13.5px] font-medium">{l.merchant}</p>
                              <FlagCount flags={lf} />
                            </div>
                            <p className="truncate text-[12px] text-muted">
                              {date(l.date, { day: 'numeric', month: 'short' })} · {l.category.name} · {PAYMENT_METHODS[l.paymentMethod]}
                              {l.description && ` · ${l.description}`}
                            </p>
                          </div>
                          <div className="hidden items-center gap-1 sm:flex">
                            {l.attachments.length ? (
                              l.attachments.map((a) => (
                                <a key={a.id} href={fileUrl(a.id)} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1 rounded-lg bg-ok/10 px-2 text-[11.5px] font-medium text-ok hover:bg-ok/15" title={a.originalName}>
                                  <Paperclip className="h-3.5 w-3.5" /> Receipt
                                </a>
                              ))
                            ) : (
                              <span className="flex h-8 items-center gap-1 rounded-lg bg-subtle px-2 text-[11.5px] text-muted"><FileWarning className="h-3.5 w-3.5" /> No receipt</span>
                            )}
                          </div>
                          <div className="w-28 text-right">
                            <p className="num text-[14px] font-semibold">{money(l.amount, l.currency)}</p>
                            {l.currency !== 'INR' && <p className="num text-[11px] text-muted">{money(l.baseAmount)}</p>}
                          </div>
                          {editable && (
                            <div className="flex gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                              <button type="button" className="btn-ghost h-8 w-8 px-0" onClick={() => setEditor({ open: true, line: l })} aria-label={`Edit ${l.merchant}`}><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" className="btn-ghost h-8 w-8 px-0 hover:text-bad" aria-label={`Delete ${l.merchant}`} onClick={() => delLine.mutate(l.id, { onSuccess: () => { toast.success('Expense removed'); refresh(); }, onError: (e) => toast.error(e.message) })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          {!editable && <MoreHorizontal className="hidden h-4 w-4 text-transparent sm:block" />}
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </motion.ul>
            )}
            <div className="flex items-center justify-between border-t border-line bg-subtle/50 px-5 py-4">
              <span className="text-[13px] font-medium">Total to reimburse</span>
              <motion.span key={total} initial={{ scale: 0.96, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} className="num text-[20px] font-semibold tracking-tight">{money(total)}</motion.span>
            </div>
          </section>

          {r.travelRequest && est > 0 && (
            <section className="card p-5">
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="font-medium">Spend vs approved estimate</span>
                <span className="num text-muted">{money(total)} / {money(est)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                <motion.div className={clsx('h-full rounded-full', total > est * 1.1 ? 'bg-bad' : total > est ? 'bg-warn' : 'bg-ok')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (total / est) * 100)}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
              </div>
              <p className="mt-1.5 text-[12px] text-muted">{total <= est ? `${money(est - total)} under the estimate for ${r.travelRequest.code}` : `${money(total - est)} over the estimate`}</p>
            </section>
          )}

          {(r.payment || ['SCHEDULED', 'PAID'].includes(r.status)) && (
            <section className="card relative overflow-hidden p-5">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-ok/10 blur-2xl" />
              <div className="relative flex items-center gap-4">
                <span className={clsx('flex h-11 w-11 items-center justify-center rounded-2xl', r.status === 'PAID' ? 'bg-ok text-white dark:text-slate-950' : 'bg-brand-soft text-brand')}>
                  {r.status === 'PAID' ? <Wallet className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                </span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold">{r.status === 'PAID' ? 'Reimbursed' : 'Payment scheduled'}</p>
                  <p className="text-[12.5px] text-muted">
                    {money(r.payment?.amount ?? r.totalBase)} · {PAYMENT_METHODS[r.payment?.method] ?? '—'} ·{' '}
                    {r.status === 'PAID' ? `paid ${date(r.payment?.paidAt)}` : `expected ${date(r.payment?.scheduledFor)}`}
                  </p>
                </div>
                {r.payment?.reference && <span className="rounded-lg bg-subtle px-2 py-1 font-mono text-[11.5px]">{r.payment.reference}</span>}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          {editable && (
            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Ready to submit?</h2>
                {checking && <Spinner className="h-3.5 w-3.5 text-muted" />}
              </div>
              <PolicyFlags flags={flags} compact />
              {policy?.route && r.lines.length > 0 && <div className="mt-4"><RoutePreview route={policy.route} /></div>}
              <button type="button" className="btn-primary mt-5 h-10 w-full" disabled={!r.lines.length} onClick={() => { setReason(r.exceptionReason ?? ''); setConfirm('submit'); }}>
                <Send className="h-4 w-4" /> {r.status === 'RETURNED' ? 'Resubmit report' : 'Submit report'}
              </button>
              {!r.lines.length && <p className="mt-2 text-center text-[12px] text-muted">Add at least one expense first.</p>}
            </section>
          )}

          {!editable && (r.policyFlags.length > 0 || r.exceptionReason) && (
            <section className="card p-5">
              <h2 className="mb-3 text-[15px] font-semibold">Policy</h2>
              <PolicyFlags flags={r.policyFlags} compact />
              {r.exceptionReason && (
                <div className="mt-3 rounded-xl border border-line p-3 text-[13px]">
                  <p className="kicker mb-1">Employee justification</p>
                  <p>{r.exceptionReason}</p>
                </div>
              )}
            </section>
          )}

          <section className="card p-5">
            <Tabs id="exp-detail" className="mb-5" value={tab} onChange={setTab} tabs={[{ value: 'approvals', label: 'Approvals' }, { value: 'activity', label: 'Activity' }, { value: 'versions', label: 'Versions', count: r.revisions.length }]} />
            {tab === 'approvals' && (
              <>
                <ApprovalTimeline steps={r.steps} currentRound={r.round} />
                {['FINANCE_REVIEW', 'SCHEDULED', 'PAID'].includes(r.status) && (
                  <div className="mt-5 flex items-center gap-3 rounded-xl bg-brand/[0.06] p-3 text-[12.5px]">
                    <Landmark className="h-4 w-4 text-brand" />
                    {r.status === 'FINANCE_REVIEW' ? 'Now with Finance for review' : r.status === 'SCHEDULED' ? 'Finance approved · payment scheduled' : 'Finance paid this report'}
                  </div>
                )}
              </>
            )}
            {tab === 'activity' && <ActivityLog items={r.activity} />}
            {tab === 'versions' && (
              <ul className="space-y-2">
                {r.revisions.length === 0 && <p className="text-[13px] text-muted">A version is saved each time the report is submitted.</p>}
                {r.revisions.map((v) => (
                  <li key={v.id} className="rounded-xl border border-line p-3 text-[12.5px]">
                    <p className="font-medium">Version {v.version} · {v.snapshot.lines?.length ?? 0} lines · {money(v.snapshot.totalBase)}</p>
                    <p className="text-muted">Submitted {dateTime(v.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <LineEditor open={editor.open} line={editor.line} reportId={id} onClose={() => setEditor({ open: false, line: null })} onSaved={refresh} />

      <Modal
        open={confirm === 'submit'}
        onClose={() => setConfirm(null)}
        title={`Submit ${money(total)} for approval?`}
        description={`${r.lines.length} expenses · ${r.code}`}
        size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="btn-primary" disabled={submit.isPending || (exception && !reason.trim())} onClick={doSubmit}>{submit.isPending && <Spinner />} Submit</button></>}
      >
        <PolicyFlags flags={flags} compact />
        {exception && (
          <Field label="Explain the policy exceptions" required className="mt-4">
            <textarea data-autofocus className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Approvers and Finance will see this." />
          </Field>
        )}
      </Modal>
      <Modal
        open={confirm === 'withdraw' || confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? 'Delete this draft?' : 'Withdraw this report?'}
        description={confirm === 'delete' ? 'All lines and receipts are removed. This cannot be undone.' : 'Pending approvals are cancelled; history is kept.'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Keep it</button>
            <button type="button" className="btn-danger" onClick={async () => {
              try {
                if (confirm === 'delete') { await remove.mutateAsync(); toast.success('Draft deleted'); navigate('/expenses'); }
                else { await withdraw.mutateAsync(); toast.success('Report withdrawn'); }
                setConfirm(null);
              } catch (e) { toast.error(e.message); }
            }}>{confirm === 'delete' ? 'Delete' : 'Withdraw'}</button>
          </>
        }
      >
        <p className="text-[13px] text-muted">{r.code} · {r.title}</p>
      </Modal>
    </div>
  );
}
