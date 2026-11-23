import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Landmark, Check, Undo2, X, Wallet, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { post } from '../../../shared/lib/api.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Field, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { ReasonDialog } from '../../../shared/components/ReasonDialog.jsx';
import { useReference } from '../../../shared/hooks/index.js';
import { money, isoDay } from '../../../shared/utils/format.js';
import { PAYMENT_METHODS } from '../../../shared/utils/status.js';

/** Finance actions on a report: approve & schedule, return, reject, recode, record payment. */
export function FinancePanel({ report, onDone }) {
  const qc = useQueryClient();
  const { data: ref } = useReference();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sched, setSched] = useState({ method: 'BANK_TRANSFER', scheduledFor: isoDay(new Date(Date.now() + 3 * 86400000)), comment: '' });
  const [pay, setPay] = useState({ method: report.payment?.method ?? 'BANK_TRANSFER', amount: Number(report.totalBase), paidAt: isoDay(new Date()), reference: '' });
  const [recode, setRecode] = useState({ costCenterId: report.costCenterId ?? '', projectCode: report.projectCode ?? '', lines: Object.fromEntries(report.lines.map((l) => [l.id, l.categoryId])) });

  const refresh = () => {
    ['expenses', 'finance', 'dashboard', 'notifications'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    onDone?.();
  };
  async function call(url, body, msg) {
    setBusy(true);
    try {
      await post(url, body);
      toast.success(msg);
      setDialog(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const review = report.status === 'FINANCE_REVIEW';
  const scheduled = report.status === 'SCHEDULED';
  if (!review && !scheduled) return null;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mb-6 flex flex-col gap-3 border-brand/30 bg-gradient-to-r from-brand/[0.06] to-transparent p-4 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white dark:text-slate-950"><Landmark className="h-5 w-5" /></span>
        <div className="flex-1">
          <p className="text-[13.5px] font-semibold">{review ? 'Finance review' : 'Payment scheduled'}</p>
          <p className="text-[12.5px] text-muted">
            {review ? 'Check receipts, coding and policy exceptions, then schedule payment.' : `${money(report.payment?.amount ?? report.totalBase)} via ${PAYMENT_METHODS[report.payment?.method] ?? '—'}. Record it once paid.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {review && (
            <>
              <button type="button" className="btn-secondary" onClick={() => setDialog('recode')}><Tags className="h-4 w-4" /> Recode</button>
              <button type="button" className="btn-secondary" onClick={() => setDialog('return')}><Undo2 className="h-4 w-4" /> Return</button>
              <button type="button" className="btn-secondary text-bad" onClick={() => setDialog('reject')}><X className="h-4 w-4" /> Reject</button>
              <button type="button" className="btn-success" onClick={() => setDialog('approve')}><Check className="h-4 w-4" /> Approve &amp; schedule</button>
            </>
          )}
          {scheduled && <button type="button" className="btn-success" onClick={() => setDialog('pay')}><Wallet className="h-4 w-4" /> Record payment</button>}
        </div>
      </motion.div>

      <ReasonDialog open={dialog === 'return'} onClose={() => setDialog(null)} busy={busy} title="Return to employee" tone="warn" confirmLabel="Return" onConfirm={(c) => call(`/finance/${report.id}/decide`, { action: 'RETURN', comment: c }, 'Returned to employee')} />
      <ReasonDialog open={dialog === 'reject'} onClose={() => setDialog(null)} busy={busy} title="Reject this report" tone="danger" confirmLabel="Reject" onConfirm={(c) => call(`/finance/${report.id}/decide`, { action: 'REJECT', comment: c }, 'Report rejected')} />

      <Modal
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title="Approve & schedule payment"
        description={`${report.code} · ${money(report.totalBase)} to ${report.employee.name}`}
        size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="btn-success" disabled={busy} onClick={() => call(`/finance/${report.id}/decide`, { action: 'APPROVE', ...sched, comment: sched.comment || undefined }, 'Payment scheduled')}>{busy && <Spinner />} Schedule</button></>}
      >
        <div className="space-y-4">
          <Field label="Payment method">
            <select className="input" value={sched.method} onChange={(e) => setSched({ ...sched, method: e.target.value })}>
              {['BANK_TRANSFER', 'PAYROLL', 'UPI', 'CHEQUE'].map((m) => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}
            </select>
          </Field>
          <Field label="Scheduled for">
            <input type="date" className="input" value={sched.scheduledFor} onChange={(e) => setSched({ ...sched, scheduledFor: e.target.value })} />
          </Field>
          <Field label="Note (optional)">
            <textarea className="input" rows={2} value={sched.comment} onChange={(e) => setSched({ ...sched, comment: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={dialog === 'pay'}
        onClose={() => setDialog(null)}
        title="Record payment"
        description="Marks the reimbursement as paid and notifies the employee."
        size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="btn-success" disabled={busy || pay.reference.trim().length < 3} onClick={() => call(`/finance/${report.id}/payment`, pay, 'Payment recorded')}>{busy && <Spinner />} Mark as paid</button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method">
            <select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {['BANK_TRANSFER', 'PAYROLL', 'UPI', 'CHEQUE'].map((m) => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}
            </select>
          </Field>
          <Field label="Amount (INR)">
            <input type="number" className="input num" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          </Field>
          <Field label="Paid on">
            <input type="date" className="input" value={pay.paidAt} onChange={(e) => setPay({ ...pay, paidAt: e.target.value })} />
          </Field>
          <Field label="Transaction reference" required hint="UTR / cheque number">
            <input data-autofocus className="input font-mono" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="UTR…" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={dialog === 'recode'}
        onClose={() => setDialog(null)}
        title="Correct accounting codes"
        description="Every change is written to the audit trail."
        size="lg"
        footer={<><button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={() => call(`/finance/${report.id}/recode`, { costCenterId: recode.costCenterId || undefined, projectCode: recode.projectCode || null, lines: Object.entries(recode.lines).map(([id, categoryId]) => ({ id, categoryId })) }, 'Coding updated')}>{busy && <Spinner />} Save coding</button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cost center">
            <select className="input" value={recode.costCenterId} onChange={(e) => setRecode({ ...recode, costCenterId: e.target.value })}>
              {ref?.costCenters?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </Field>
          <Field label="Project code">
            <input className="input" value={recode.projectCode} onChange={(e) => setRecode({ ...recode, projectCode: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5 space-y-2">
          {report.lines.map((l) => (
            <div key={l.id} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center">
              <span className="flex-1 text-[13px]">{l.merchant} · <span className="num">{money(l.baseAmount)}</span></span>
              <select className="input h-9 sm:w-56" value={recode.lines[l.id]} onChange={(e) => setRecode({ ...recode, lines: { ...recode.lines, [l.id]: e.target.value } })} aria-label={`Category for ${l.merchant}`}>
                {ref?.categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
