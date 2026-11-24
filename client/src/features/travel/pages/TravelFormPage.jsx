import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowLeft, Plane, Globe2, Hotel, UtensilsCrossed, CircleEllipsis, Car, Send, Save, X, Users, CalendarDays, ShieldAlert, Wand2, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../../app/store.js';
import { Field, Spinner, Skeleton } from '../../../shared/components/ui/primitives.jsx';
import { PolicyFlags, hasViolation } from '../../../shared/components/PolicyFlags.jsx';
import { RoutePreview } from '../../../shared/components/RoutePreview.jsx';
import { useReference, useDebounce } from '../../../shared/hooks/index.js';
import { money, isoDay, nights } from '../../../shared/utils/format.js';
import { travelApi } from '../api/travelApi.js';
import { useTravel, useTravelMutation } from '../hooks/useTravel.js';

const plus = (days) => isoDay(new Date(Date.now() + days * 86400000));
const LOCAL_KEY = 'voyage-travel-draft';
const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
  } catch {
    return null;
  }
};
const writeLocal = (v) => {
  try {
    v ? localStorage.setItem(LOCAL_KEY, JSON.stringify(v)) : localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* storage unavailable - autosave is a convenience only */
  }
};

const EMPTY = {
  title: '', purpose: '', travelType: 'DOMESTIC', origin: '', destination: '', startDate: plus(14), endDate: plus(16),
  travelers: [], estTransport: '', estLodging: '', estMeals: '', estOther: '', currency: 'INR', costCenterId: '', projectCode: '', notes: '',
};

const COSTS = [
  { key: 'estTransport', label: 'Transport', icon: Car, hint: 'Flights, trains, cabs' },
  { key: 'estLodging', label: 'Lodging', icon: Hotel, hint: 'Hotels and stays' },
  { key: 'estMeals', label: 'Meals', icon: UtensilsCrossed, hint: 'Per-diem meals' },
  { key: 'estOther', label: 'Other', icon: CircleEllipsis, hint: 'Visa, fees, misc.' },
];

function Section({ title, description, children, step }) {
  return (
    <section className="card p-5 md:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">{step}</span>
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="text-[12.5px] text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function TravelFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const { data: ref } = useReference();
  const { data: existing, isLoading } = useTravel(id);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [traveler, setTraveler] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const [params] = useSearchParams();
  const copyId = params.get('copy');
  const { data: source } = useTravel(!editing ? copyId : null);
  const [restorable, setRestorable] = useState(() => (!editing && !copyId ? readLocal() : null));
  const [savedAt, setSavedAt] = useState(null);

  // Duplicate a past trip: same route, people and costs, fresh dates.
  useEffect(() => {
    if (!source) return;
    const len = Math.max(0, Math.round((new Date(source.endDate) - new Date(source.startDate)) / 86400000));
    setForm({
      ...EMPTY,
      title: source.title, purpose: source.purpose, travelType: source.travelType, origin: source.origin, destination: source.destination,
      travelers: source.travelers, currency: source.currency, costCenterId: source.costCenterId ?? '', projectCode: source.projectCode ?? '', notes: '',
      estTransport: Number(source.estTransport), estLodging: Number(source.estLodging), estMeals: Number(source.estMeals), estOther: Number(source.estOther),
      startDate: plus(21), endDate: plus(21 + len),
    });
    toast.info(`Copied from ${source.code}`, { description: 'Dates moved three weeks out. Adjust as needed.' });
  }, [source]);

  // Autosave unsent new requests in this browser.
  useEffect(() => {
    if (editing || restorable) return undefined;
    const t = setTimeout(() => {
      if (form.title || form.purpose || form.destination) {
        writeLocal(form);
        setSavedAt(new Date());
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form, editing, restorable]);

  useEffect(() => {
    if (existing) {
      setForm({
        ...EMPTY, ...existing,
        startDate: isoDay(existing.startDate), endDate: isoDay(existing.endDate),
        estTransport: Number(existing.estTransport), estLodging: Number(existing.estLodging), estMeals: Number(existing.estMeals), estOther: Number(existing.estOther),
        costCenterId: existing.costCenterId ?? '', projectCode: existing.projectCode ?? '', notes: existing.notes ?? '',
      });
      setReason(existing.exceptionReason ?? '');
    } else if (!editing && user) {
      setForm((f) => ({ ...f, travelers: f.travelers.length ? f.travelers : [user.name], costCenterId: f.costCenterId || user.costCenter?.id || '', origin: f.origin || user.location || '' }));
    }
  }, [existing, editing, user]);

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const total = COSTS.reduce((a, c) => a + (Number(form[c.key]) || 0), 0);
  const rate = Number(ref?.currencies?.find((c) => c.code === form.currency)?.rateToBase ?? 1);
  const payload = useMemo(
    () => ({ ...form, ...Object.fromEntries(COSTS.map((c) => [c.key, Number(form[c.key]) || 0])), projectCode: form.projectCode || null, notes: form.notes || null }),
    [form],
  );
  const debounced = useDebounce(payload, 450);
  const ready = debounced.title.length >= 3 && debounced.purpose.length >= 5 && debounced.origin.length >= 2 && debounced.destination.length >= 2 && debounced.costCenterId && debounced.endDate >= debounced.startDate;
  const { data: preview, isFetching: checking } = useQuery({
    queryKey: ['travel-preview', debounced],
    queryFn: () => travelApi.preview(debounced),
    enabled: !!ready,
    placeholderData: (p) => p,
    staleTime: 10_000,
  });
  const exception = hasViolation(preview?.flags);

  const save = useTravelMutation((body) => (editing ? travelApi.update(id, body) : travelApi.create(body)));

  function validate() {
    const e = {};
    if (form.title.trim().length < 3) e.title = 'Give the trip a short title';
    if (form.purpose.trim().length < 5) e.purpose = 'Describe the business purpose';
    if (form.origin.trim().length < 2) e.origin = 'Where are you travelling from?';
    if (form.destination.trim().length < 2) e.destination = 'Where are you going?';
    if (!form.costCenterId) e.costCenterId = 'Choose a cost center';
    if (form.endDate < form.startDate) e.endDate = 'Return date must be on or after departure';
    setErrors(e);
    if (Object.keys(e).length) {
      document.querySelector(`[name="${Object.keys(e)[0]}"]`)?.focus();
      toast.error('Please fix the highlighted fields');
    }
    return !Object.keys(e).length;
  }

  async function run(submit) {
    if (!validate()) return;
    if (submit && exception && !reason.trim()) {
      document.getElementById('exception-reason')?.focus();
      return toast.error('Explain why this out-of-policy trip is needed');
    }
    setBusy(submit ? 'submit' : 'save');
    try {
      const saved = await save.mutateAsync(payload);
      writeLocal(null);
      if (submit) {
        await travelApi.submit(saved.id, reason.trim() || undefined);
        toast.success(`${saved.code} submitted`, { description: 'We have notified your first approver.' });
      } else {
        toast.success(editing ? 'Changes saved' : `Draft ${saved.code} saved`);
      }
      navigate(`/travel/${saved.id}`);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (editing && isLoading) return <Skeleton className="h-[600px] rounded-2xl" />;
  if (existing && !['DRAFT', 'RETURNED'].includes(existing.status)) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[14px]">This request can no longer be edited.</p>
        <Link className="btn-secondary mt-4" to={`/travel/${id}`}>Back to request</Link>
      </div>
    );
  }

  const addTraveler = () => {
    const t = traveler.trim();
    if (t && !form.travelers.includes(t)) set('travelers')([...form.travelers, t]);
    setTraveler('');
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="btn-ghost h-9 w-9 px-0" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="kicker">{editing ? existing?.code : 'New request'}</p>
          <h1 className="text-[22px] font-semibold tracking-tight">{editing ? 'Edit travel request' : 'Plan a business trip'}</h1>
        </div>
        <AnimatePresence>
          {savedAt && !editing && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="ml-auto hidden items-center gap-1.5 text-[12px] text-muted sm:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> Autosaved in this browser
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {restorable && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-brand/25 bg-brand/[0.05] p-4 sm:flex-row sm:items-center">
              <Copy className="h-4 w-4 text-brand" />
              <p className="flex-1 text-[13px]">
                You have an unsent request{restorable.title ? <> — <strong>{restorable.title}</strong></> : ''}. Pick up where you left off?
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => { writeLocal(null); setRestorable(null); }}>Discard</button>
                <button type="button" className="btn-primary" onClick={() => { setForm({ ...EMPTY, ...restorable }); setRestorable(null); }}>Restore</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {existing?.status === 'RETURNED' && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/[0.07] p-4 text-[13px]">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-warn" />
          <div>
            <p className="font-medium">Returned for changes</p>
            <p className="text-muted">{existing.steps?.find((s) => s.status === 'RETURNED' && s.round === existing.round)?.comment ?? 'Update the request and resubmit.'}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <form className="min-w-0 space-y-5" onSubmit={(e) => { e.preventDefault(); run(true); }} noValidate>
          <Section step={1} title="Trip details" description="Tell approvers what the trip is for.">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'DOMESTIC', label: 'Domestic', icon: Plane, sub: 'Within the country' },
                  { v: 'INTERNATIONAL', label: 'International', icon: Globe2, sub: 'Needs extra approval' },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.v}
                    onClick={() => set('travelType')(o.v)}
                    aria-pressed={form.travelType === o.v}
                    className={clsx('relative flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all', form.travelType === o.v ? 'border-brand bg-brand/[0.05] ring-4 ring-brand/10' : 'border-line hover:border-muted/40')}
                  >
                    <span className={clsx('flex h-9 w-9 items-center justify-center rounded-xl transition-colors', form.travelType === o.v ? 'bg-brand text-white dark:text-slate-950' : 'bg-subtle text-muted')}>
                      <o.icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-[13.5px] font-medium">{o.label}</span>
                      <span className="block text-[11.5px] text-muted">{o.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              <Field label="Trip title" required error={errors.title}>
                <input name="title" className="input" value={form.title} onChange={set('title')} placeholder="e.g. Customer workshop in Pune" maxLength={140} />
              </Field>
              <Field label="Business purpose" required error={errors.purpose} hint="A clear purpose gets approved faster.">
                <textarea name="purpose" className="input" rows={3} value={form.purpose} onChange={set('purpose')} placeholder="Who are you meeting and what will the trip achieve?" maxLength={2000} />
              </Field>
            </div>
          </Section>

          <Section step={2} title="Route & dates">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" required error={errors.origin}>
                <input name="origin" className="input" value={form.origin} onChange={set('origin')} placeholder="City" />
              </Field>
              <Field label="To" required error={errors.destination}>
                <input name="destination" className="input" value={form.destination} onChange={set('destination')} placeholder="City (add more with commas)" />
              </Field>
              <Field label="Departure" required error={errors.startDate}>
                <input name="startDate" type="date" className="input" value={form.startDate} onChange={set('startDate')} />
              </Field>
              <Field label="Return" required error={errors.endDate}>
                <input name="endDate" type="date" className="input" min={form.startDate} value={form.endDate} onChange={set('endDate')} />
              </Field>
              <Field label="Travelers" className="sm:col-span-2">
                <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
                  <AnimatePresence initial={false}>
                    {form.travelers.map((t) => (
                      <motion.span key={t} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft py-0.5 pl-2.5 pr-0.5 text-[12.5px] font-medium text-brand-ink">
                        {t}
                        <button type="button" onClick={() => set('travelers')(form.travelers.filter((x) => x !== t))} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-brand/15" aria-label={`Remove ${t}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <input
                    className="h-7 min-w-[140px] flex-1 bg-transparent px-1.5 text-[13.5px] outline-none placeholder:text-muted/70"
                    value={traveler}
                    onChange={(e) => setTraveler(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTraveler(); } }}
                    onBlur={addTraveler}
                    placeholder="Add a name and press Enter"
                    aria-label="Add traveler"
                  />
                </div>
              </Field>
            </div>
          </Section>

          <Section step={3} title="Estimated costs" description="Rough numbers are fine. You will claim actual amounts later.">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="label mb-0" htmlFor="currency">Currency</label>
              <select id="currency" className="input h-9 w-40" value={form.currency} onChange={set('currency')}>
                {(ref?.currencies ?? [{ code: 'INR', name: 'Indian Rupee' }]).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </select>
              {form.currency !== (ref?.settings?.baseCurrency ?? 'INR') && <span className="text-[12px] text-muted">1 {form.currency} = {money(rate, 'INR', { decimals: 2 })}</span>}
              {ref?.settings?.mealsPerDiem > 0 && (
                <button
                  type="button"
                  className="btn-ghost ml-auto h-8 text-[12px] text-brand"
                  title="Fill meals and lodging from company policy"
                  onClick={() => {
                    const days = nights(form.startDate, form.endDate) + 1;
                    const n = Math.max(days - 1, 1);
                    const cap = form.travelType === 'INTERNATIONAL' ? ref.settings.lodgingCapInternational : ref.settings.lodgingCapDomestic;
                    const conv = (v) => Math.round((v / rate) * 100) / 100;
                    setForm((f) => ({ ...f, estMeals: conv(ref.settings.mealsPerDiem * days), estLodging: f.estLodging || conv(cap * n) }));
                    toast.success('Filled from policy', { description: `Meals ${days} days × ${money(ref.settings.mealsPerDiem)}${!form.estLodging ? `, lodging ${n} nights × ${money(cap)}` : ''}` });
                  }}
                >
                  <Wand2 className="h-3.5 w-3.5" /> Use policy rates
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {COSTS.map((c) => (
                <div key={c.key} className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                    <c.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={c.key} className="block text-[12.5px] font-medium">{c.label}</label>
                    <p className="text-[11px] text-muted">{c.hint}</p>
                  </div>
                  <input id={c.key} name={c.key} type="number" min="0" step="0.01" inputMode="decimal" className="num h-9 w-28 rounded-lg border border-line bg-subtle/50 px-2 text-right text-[14px] font-medium outline-none focus:border-brand focus:bg-surface" value={form[c.key]} onChange={set(c.key)} placeholder="0" />
                </div>
              ))}
            </div>
          </Section>

          <Section step={4} title="Billing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cost center" required error={errors.costCenterId}>
                <select name="costCenterId" className="input" value={form.costCenterId} onChange={set('costCenterId')}>
                  <option value="">Select…</option>
                  {ref?.costCenters?.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Project code" hint="Optional">
                <input className="input" value={form.projectCode ?? ''} onChange={set('projectCode')} placeholder="e.g. PRJ-1042" maxLength={40} />
              </Field>
              <Field label="Notes for approvers" className="sm:col-span-2">
                <textarea className="input" rows={2} value={form.notes ?? ''} onChange={set('notes')} placeholder="Anything else they should know?" maxLength={2000} />
              </Field>
            </div>
          </Section>
        </form>

        <aside aria-label="Trip summary" className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <div className="card overflow-hidden">
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 p-5 text-white">
              <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-xl" />
              <p className="text-[12px] font-medium text-white/70">Estimated total</p>
              <motion.p key={total + form.currency} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="num mt-1 text-[30px] font-semibold tracking-tight">
                {money(total, form.currency)}
              </motion.p>
              {form.currency !== 'INR' && <p className="num text-[12.5px] text-white/75">≈ {money(total * rate)}</p>}
              <div className="mt-4 flex flex-wrap gap-3 text-[12px] text-white/80">
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {nights(form.startDate, form.endDate)} nights</span>
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {form.travelers.length || 1} traveler{form.travelers.length > 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="kicker">Policy check</span>
                  {checking && <Spinner className="h-3.5 w-3.5 text-muted" />}
                </div>
                {ready ? <PolicyFlags flags={preview?.flags ?? []} compact /> : <p className="text-[12.5px] text-muted">Fill in the trip details to run policy checks.</p>}
              </div>
              {ready && preview?.route && <RoutePreview route={preview.route} />}
              <AnimatePresence>
                {exception && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <Field label="Why is this exception needed?" required>
                      <textarea id="exception-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="This note goes to every approver." maxLength={2000} />
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => run(true)} disabled={!!busy} className="btn-primary h-10">
                  {busy === 'submit' ? <Spinner /> : <Send className="h-4 w-4" />} {existing?.status === 'RETURNED' ? 'Resubmit for approval' : 'Submit for approval'}
                </button>
                <button type="button" onClick={() => run(false)} disabled={!!busy} className="btn-secondary h-10">
                  {busy === 'save' ? <Spinner /> : <Save className="h-4 w-4" />} Save as draft
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
