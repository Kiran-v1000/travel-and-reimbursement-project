import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Plane, MapPin, Receipt, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../../app/store.js';
import { Field, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { useReference } from '../../../shared/hooks/index.js';
import { money, date } from '../../../shared/utils/format.js';
import { ease } from '../../../shared/lib/motion.js';
import { expensesApi } from '../api/expensesApi.js';
import { useExpenseMutation } from '../hooks/useExpenses.js';

export function ExpenseNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useAppStore((s) => s.user);
  const { data: ref } = useReference();
  const { data: trips = [] } = useQuery({ queryKey: ['travel', 'linkable'], queryFn: expensesApi.linkableTrips });
  const [form, setForm] = useState({ title: '', purpose: '', travelRequestId: params.get('trip') ?? '', costCenterId: '', projectCode: '' });
  const [errors, setErrors] = useState({});
  const create = useExpenseMutation(expensesApi.create);

  useEffect(() => {
    if (!form.costCenterId && user?.costCenter?.id) setForm((f) => ({ ...f, costCenterId: user.costCenter.id }));
  }, [user, form.costCenterId]);

  // Prefill from the linked trip.
  useEffect(() => {
    const t = trips.find((x) => x.id === form.travelRequestId);
    if (t) setForm((f) => ({ ...f, title: f.title || t.title, purpose: f.purpose || `Expenses for ${t.title} (${t.code})`, costCenterId: t.costCenterId || f.costCenterId, projectCode: f.projectCode || t.projectCode || '' }));
  }, [form.travelRequestId, trips]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    try {
      const r = await create.mutateAsync({ ...form, travelRequestId: form.travelRequestId || null, projectCode: form.projectCode || null });
      toast.success(`${r.code} created`, { description: 'Now add your expenses and receipts.' });
      navigate(`/expenses/${r.id}`, { replace: true });
    } catch (err) {
      setErrors(err.fields ?? {});
      toast.error(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="btn-ghost h-9 w-9 px-0" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="kicker">New expense report · step 1 of 2</p>
          <h1 className="text-[22px] font-semibold tracking-tight">What are you claiming for?</h1>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5" noValidate>
        <section className="card p-5 md:p-6">
          <h2 className="mb-1 text-[15px] font-semibold">Link a trip</h2>
          <p className="mb-4 text-[12.5px] text-muted">Linking an approved trip lets us compare your spend with what was approved.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => setForm((f) => ({ ...f, travelRequestId: '' }))}
              className={clsx('flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all', !form.travelRequestId ? 'border-brand bg-brand/[0.05] ring-4 ring-brand/10' : 'border-line hover:border-muted/40')}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-subtle text-muted"><Receipt className="h-4 w-4" /></span>
              <span className="flex-1">
                <span className="block text-[13px] font-medium">No trip</span>
                <span className="block text-[11.5px] text-muted">Local or general business expenses</span>
              </span>
              {!form.travelRequestId && <Check className="h-4 w-4 text-brand" />}
            </motion.button>
            {trips.map((t, i) => (
              <motion.button
                key={t.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ease }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setForm((f) => ({ ...f, travelRequestId: t.id }))}
                className={clsx('flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all', form.travelRequestId === t.id ? 'border-brand bg-brand/[0.05] ring-4 ring-brand/10' : 'border-line hover:border-muted/40')}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand"><Plane className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{t.title}</span>
                  <span className="flex items-center gap-1 truncate text-[11.5px] text-muted"><MapPin className="h-3 w-3" />{t.destination} · {date(t.startDate, { day: 'numeric', month: 'short' })} · {money(t.estTotalBase)}</span>
                </span>
                {form.travelRequestId === t.id && <Check className="h-4 w-4 text-brand" />}
              </motion.button>
            ))}
          </div>
        </section>

        <section className="card p-5 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Report title" required error={errors.title} className="sm:col-span-2">
              <input className="input" value={form.title} onChange={set('title')} placeholder="e.g. Client visit - Mumbai, March" maxLength={140} />
            </Field>
            <Field label="Business purpose" required error={errors.purpose} className="sm:col-span-2">
              <textarea className="input" rows={3} value={form.purpose} onChange={set('purpose')} placeholder="Why were these costs needed?" maxLength={2000} />
            </Field>
            <Field label="Cost center" required error={errors.costCenterId}>
              <select className="input" value={form.costCenterId} onChange={set('costCenterId')}>
                <option value="">Select…</option>
                {ref?.costCenters?.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Project code" hint="Optional">
              <input className="input" value={form.projectCode} onChange={set('projectCode')} maxLength={40} />
            </Field>
          </div>
        </section>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary group h-10 px-5" disabled={create.isPending}>
            {create.isPending && <Spinner />} Continue to add expenses <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
