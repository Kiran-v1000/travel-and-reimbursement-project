import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Field, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { FileDrop } from '../../../shared/components/FileDrop.jsx';
import { PolicyFlags } from '../../../shared/components/PolicyFlags.jsx';
import { useReference } from '../../../shared/hooks/index.js';
import { money, isoDay } from '../../../shared/utils/format.js';
import { PAYMENT_METHODS } from '../../../shared/utils/status.js';
import { expensesApi } from '../api/expensesApi.js';
import { CategoryIcon } from './CategoryIcon.jsx';

const blank = () => ({ date: isoDay(new Date()), categoryId: '', merchant: '', description: '', amount: '', tax: '', currency: 'INR', paymentMethod: 'PERSONAL_CARD' });

/**
 * Side drawer to add or edit one expense line. After saving a new line the
 * drawer stays open on the receipt step so the user can attach proof.
 */
export function LineEditor({ open, onClose, reportId, line, onSaved }) {
  const { data: ref } = useReference();
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSaved(line ?? null);
    setForm(line ? { ...blank(), ...line, date: isoDay(line.date), amount: Number(line.amount), tax: Number(line.tax) || '', description: line.description ?? '' } : blank());
  }, [open, line]);

  const cat = ref?.categories?.find((c) => c.id === form.categoryId);
  const rate = Number(ref?.currencies?.find((c) => c.code === form.currency)?.rateToBase ?? 1);
  const base = (Number(form.amount) || 0) * rate;
  const overLimit = cat?.perItemLimit != null && base > Number(cat.perItemLimit);
  const needsReceipt = cat && base >= Number(cat.receiptThreshold);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function save(e) {
    e?.preventDefault();
    const body = { ...form, amount: Number(form.amount), tax: Number(form.tax) || 0, description: form.description || null };
    const er = {};
    if (!body.categoryId) er.categoryId = 'Choose a category';
    if (!body.merchant.trim()) er.merchant = 'Who did you pay?';
    if (!(body.amount > 0)) er.amount = 'Enter an amount';
    if (Object.keys(er).length) return setErrors(er);
    setBusy(true);
    try {
      const res = saved ? await expensesApi.updateLine(reportId, saved.id, body) : await expensesApi.addLine(reportId, body);
      toast.success(saved ? 'Expense updated' : 'Expense added');
      onSaved?.();
      if (!saved) setSaved({ ...res, attachments: [] });
      else onClose();
    } catch (err) {
      setErrors(err.fields ?? {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const receiptStep = saved && !line;

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      title={receiptStep ? 'Attach the receipt' : line ? 'Edit expense' : 'Add an expense'}
      description={receiptStep ? `${saved.merchant} · ${money(saved.amount, saved.currency)}` : 'Policy limits are checked as you type.'}
      footer={
        receiptStep ? (
          <>
            <button type="button" className="btn-secondary" onClick={() => { setSaved(null); setForm(blank()); }}>
              Add another
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              <Check className="h-4 w-4" /> Done
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" form="line-form" className="btn-primary" disabled={busy}>
              {busy && <Spinner />} {line ? 'Save changes' : 'Save & add receipt'}
            </button>
          </>
        )
      }
    >
      {receiptStep ? (
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-ok/[0.07] p-3.5 text-[13px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ok text-white dark:text-slate-950"><Check className="h-4 w-4" /></span>
            Expense saved. {needsReceipt ? 'A receipt is required for this amount.' : 'Receipts are optional for this amount but speed up Finance review.'}
          </div>
          <FileDrop target={{ expenseLineId: saved.id }} files={saved.attachments ?? []} editable onChange={async () => {
            const r = await expensesApi.get(reportId);
            const l = r.lines.find((x) => x.id === saved.id);
            if (l) setSaved({ ...saved, attachments: l.attachments });
            onSaved?.();
          }} />
        </motion.div>
      ) : (
        <form id="line-form" onSubmit={save} className="space-y-5" noValidate>
          <Field label="Category" required error={errors.categoryId}>
            <div className="grid grid-cols-3 gap-2">
              {ref?.categories?.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => set('categoryId')(c.id)}
                  aria-pressed={form.categoryId === c.id}
                  className={clsx('flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition-all', form.categoryId === c.id ? 'border-brand bg-brand/[0.05] ring-4 ring-brand/10' : 'border-line hover:border-muted/40')}
                >
                  <CategoryIcon icon={c.icon} size={32} />
                  <span className="line-clamp-2 text-[11.5px] font-medium leading-tight">{c.name}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" required error={errors.date}>
              <input type="date" className="input" max={isoDay(new Date())} value={form.date} onChange={set('date')} />
            </Field>
            <Field label="Merchant" required error={errors.merchant}>
              <input className="input" value={form.merchant} onChange={set('merchant')} placeholder="e.g. Uber, Taj Hotels" maxLength={140} />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Amount" required error={errors.amount}>
              <input type="number" min="0" step="0.01" inputMode="decimal" className="input num text-[15px] font-semibold" value={form.amount} onChange={set('amount')} placeholder="0.00" />
            </Field>
            <Field label="Currency">
              <select className="input" value={form.currency} onChange={set('currency')}>
                {(ref?.currencies ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </Field>
          </div>
          {form.currency !== 'INR' && Number(form.amount) > 0 && (
            <p className="-mt-2 text-[12px] text-muted">≈ {money(base)} at {rate} INR / {form.currency} (rate is saved with the line)</p>
          )}
          {cat && Number(form.amount) > 0 && (
            <PolicyFlags
              compact
              showOk
              flags={[
                ...(overLimit ? [{ code: 'LIMIT', severity: 'violation', message: `Above the ${cat.name} limit of ${money(cat.perItemLimit)}. You will need to justify it.` }] : []),
                ...(needsReceipt ? [{ code: 'RECEIPT', severity: 'warning', message: `A receipt is required above ${money(cat.receiptThreshold)}.` }] : []),
              ]}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tax included" hint="GST / VAT, if shown">
              <input type="number" min="0" step="0.01" className="input num" value={form.tax} onChange={set('tax')} placeholder="0.00" />
            </Field>
            <Field label="Paid with">
              <select className="input" value={form.paymentMethod} onChange={set('paymentMethod')}>
                {['PERSONAL_CARD', 'UPI', 'CASH', 'CORPORATE_CARD', 'BANK_TRANSFER'].map((m) => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea className="input" rows={2} value={form.description} onChange={set('description')} placeholder="Who attended, what it was for…" maxLength={500} />
          </Field>
          {line && (
            <div>
              <p className="label flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Receipts</p>
              <FileDrop target={{ expenseLineId: line.id }} files={line.attachments ?? []} editable onChange={onSaved} compact />
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
