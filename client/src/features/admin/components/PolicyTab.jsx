import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Field, Spinner, Skeleton } from '../../../shared/components/ui/primitives.jsx';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { UserPicker } from '../../../shared/components/UserPicker.jsx';
import { money } from '../../../shared/utils/format.js';
import { adminApi } from '../api/adminApi.js';

const NUMS = [
  ['leadDaysDomestic', 'Domestic lead time', 'days'], ['leadDaysInternational', 'International lead time', 'days'], ['maxTripDays', 'Max trip length', 'days'],
  ['lodgingCapDomestic', 'Lodging cap (domestic)', 'INR / night'], ['lodgingCapInternational', 'Lodging cap (international)', 'INR / night'], ['mealsPerDiem', 'Meals per-diem', 'INR / day'],
  ['submissionDeadlineDays', 'Claim deadline', 'days after spend'], ['estimateTolerancePct', 'Over-estimate tolerance', '%'], ['approvalTimeoutHours', 'Approval timeout', 'hours'], ['retentionYears', 'Record retention', 'years'],
];

export function PolicyTab() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });
  const { data: cats = [] } = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });
  const [s, setS] = useState(null);
  const [cat, setCat] = useState(null);
  useEffect(() => {
    if (settings) setS(settings);
  }, [settings]);

  const save = useMutation({
    mutationFn: () => {
      const keys = [...NUMS.map(([k]) => k), 'escalationEnabled', 'resubmitRule', 'fallbackApproverId', 'emailNotifications', 'accountingBankLedger', 'accountingAdjustmentLedger'];
      return adminApi.saveSettings(Object.fromEntries(keys.map((k) => [k, NUMS.some(([n]) => n === k) ? Number(s[k]) : s[k]])));
    },
    onSuccess: () => { toast.success('Policy saved', { description: 'New checks apply immediately.' }); qc.invalidateQueries({ queryKey: ['admin', 'settings'] }); qc.invalidateQueries({ queryKey: ['reference'] }); },
    onError: (e) => toast.error(e.message),
  });
  const saveCat = useMutation({
    mutationFn: () => adminApi.saveCategory(cat.id, { code: cat.code, name: cat.name, icon: cat.icon, perItemLimit: cat.perItemLimit === '' || cat.perItemLimit == null ? null : Number(cat.perItemLimit), receiptThreshold: Number(cat.receiptThreshold), glAccount: cat.glAccount?.trim() || null, active: cat.active }),
    onSuccess: () => { toast.success('Category saved'); setCat(null); qc.invalidateQueries({ queryKey: ['admin', 'categories'] }); qc.invalidateQueries({ queryKey: ['reference'] }); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !s) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-[14.5px] font-semibold">Travel & claim policy</h2><p className="text-[12.5px] text-muted">These limits drive the live policy checks employees see.</p></div>
          <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save policy</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {NUMS.map(([k, label, unit]) => (
            <Field key={k} label={label} hint={unit}><input type="number" min="0" className="input num" value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Fallback approver" hint="Used when an approver is missing or inactive">
            <UserPicker value={s.fallbackApproverId ?? null} onChange={(id) => setS({ ...s, fallbackApproverId: id })} placeholder="First administrator (default)" ariaLabel="Fallback approver" />
          </Field>
          <Field label="After a return, resubmission…">
            <select className="input" value={s.resubmitRule} onChange={(e) => setS({ ...s, resubmitRule: e.target.value })}><option value="RESTART">Restarts the full route</option><option value="RETURNING_LEVEL">Resumes at the level that returned it</option></select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2.5 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={!!s.escalationEnabled} onChange={(e) => setS({ ...s, escalationEnabled: e.target.checked })} /> Escalate overdue approvals</label>
          <label className="flex items-center gap-2 self-end pb-2.5 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={s.emailNotifications !== false} onChange={(e) => setS({ ...s, emailNotifications: e.target.checked })} /> Email notifications</label>
        </div>
        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Field label="Bank ledger (accounting export)" hint="Payments are credited to this ledger"><input className="input" maxLength={120} value={s.accountingBankLedger ?? ''} onChange={(e) => setS({ ...s, accountingBankLedger: e.target.value })} /></Field>
          <Field label="Adjustment ledger" hint="Takes any difference between amount paid and amount claimed"><input className="input" maxLength={120} value={s.accountingAdjustmentLedger ?? ''} onChange={(e) => setS({ ...s, accountingAdjustmentLedger: e.target.value })} /></Field>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[14.5px] font-semibold">Expense categories</h2>
          <button type="button" className="btn-secondary" onClick={() => setCat({ code: '', name: '', icon: 'receipt', perItemLimit: '', receiptThreshold: 500, glAccount: '', active: true })}><Plus className="h-4 w-4" /> Add category</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-subtle/50 text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-5 py-2.5 font-semibold">Category</th><th className="px-3 py-2.5 text-right font-semibold">Per-item limit</th><th className="px-3 py-2.5 text-right font-semibold">Receipt above</th><th className="px-3 py-2.5 font-semibold">Ledger</th><th className="px-3 py-2.5 font-semibold">Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id} className="table-row border-t border-line/60">
                  <td className="px-5 py-2.5 font-medium">{c.name} <span className="font-mono text-[11px] text-muted">{c.code}</span></td>
                  <td className="num px-3 py-2.5 text-right">{c.perItemLimit ? money(c.perItemLimit) : 'No limit'}</td>
                  <td className="num px-3 py-2.5 text-right">{Number(c.receiptThreshold) === 0 ? 'Always' : money(c.receiptThreshold)}</td>
                  <td className="px-3 py-2.5">{c.glAccount || <span className="text-warn">Not set</span>}</td>
                  <td className="px-3 py-2.5">{c.active ? 'Active' : 'Hidden'}</td>
                  <td className="px-3 py-2.5 text-right"><button type="button" className="btn-ghost h-8 w-8 px-0" onClick={() => setCat({ ...c, perItemLimit: c.perItemLimit ?? '', glAccount: c.glAccount ?? '' })} aria-label={`Edit ${c.name}`}><Pencil className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={!!cat} onClose={() => setCat(null)} size="sm" title={cat?.id ? `Edit ${cat.name}` : 'New category'}
        footer={<><button type="button" className="btn-secondary" onClick={() => setCat(null)}>Cancel</button><button type="button" className="btn-primary" disabled={saveCat.isPending} onClick={() => saveCat.mutate()}>{saveCat.isPending && <Spinner />} Save</button></>}>
        {cat && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} /></Field>
            <Field label="Code"><input className="input font-mono" value={cat.code} onChange={(e) => setCat({ ...cat, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Per-item limit (INR)" hint="Blank = no limit"><input type="number" className="input num" value={cat.perItemLimit} onChange={(e) => setCat({ ...cat, perItemLimit: e.target.value })} /></Field>
            <Field label="Receipt required above" hint="0 = always"><input type="number" className="input num" value={cat.receiptThreshold} onChange={(e) => setCat({ ...cat, receiptThreshold: e.target.value })} /></Field>
            <Field label="Accounting ledger" hint="GL account in Tally / your books" className="sm:col-span-2"><input className="input" maxLength={120} placeholder="e.g. Travel - Airfare" value={cat.glAccount} onChange={(e) => setCat({ ...cat, glAccount: e.target.value })} /></Field>
            <Field label="Icon"><select className="input" value={cat.icon} onChange={(e) => setCat({ ...cat, icon: e.target.value })}>{['plane', 'train', 'bed', 'utensils', 'car', 'stamp', 'wine', 'wifi', 'receipt'].map((i) => <option key={i}>{i}</option>)}</select></Field>
            <label className="flex items-center gap-2 self-end pb-2.5 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={cat.active} onChange={(e) => setCat({ ...cat, active: e.target.checked })} /> Active</label>
          </div>
        )}
      </Modal>
    </div>
  );
}
