import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Field, Segmented, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { UserPicker } from '../../../shared/components/UserPicker.jsx';
import { complianceApi } from '../api/complianceApi.js';

const SCOPES = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'EXPENSE', label: 'Expense report' },
  { value: 'TRAVEL', label: 'Trip' },
  { value: 'PERIOD', label: 'Date range' },
];

const HELP = {
  EMPLOYEE: 'Freezes every trip and expense report this person has raised so far. New ones they create stay editable.',
  EXPENSE: 'Freezes one expense report.',
  TRAVEL: 'Freezes one trip and every expense report linked to it.',
  PERIOD: 'Freezes every trip and expense report created in the range (up to today).',
};

const blank = { scope: 'EMPLOYEE', userId: null, code: '', from: '', to: '', reason: '', reference: '' };

export function PlaceHoldDialog({ open, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) { setF(blank); setErrors({}); }
  }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  const place = useMutation({
    mutationFn: () => complianceApi.placeHold({
      scope: f.scope, reason: f.reason, reference: f.reference || undefined,
      ...(f.scope === 'EMPLOYEE' ? { userId: f.userId ?? undefined } : {}),
      ...(f.scope === 'EXPENSE' || f.scope === 'TRAVEL' ? { code: f.code } : {}),
      ...(f.scope === 'PERIOD' ? { from: f.from, to: f.to } : {}),
    }),
    onSuccess: (h) => {
      toast.success('Legal hold placed', { description: h.subject });
      qc.invalidateQueries({ queryKey: ['compliance'] });
      onClose();
    },
    onError: (e) => { setErrors(e.fields ?? {}); toast.error(e.message); },
  });

  const footer = (
    <>
      <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="btn-primary" disabled={place.isPending} onClick={() => place.mutate()}>
        {place.isPending ? <Spinner className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Place hold
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Place a legal hold" description="Held records are never purged and cannot be edited or deleted until the hold is released." footer={footer}>
      <p className="label">What to hold</p>
      <Segmented options={SCOPES} value={f.scope} onChange={(v) => { setErrors({}); set('scope')(v); }} />
      <p className="mt-1.5 text-[12px] text-muted">{HELP[f.scope]}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {f.scope === 'EMPLOYEE' && (
          <Field label="Employee" required error={errors.userId} className="sm:col-span-2">
            <UserPicker value={f.userId} onChange={set('userId')} ariaLabel="Employee to hold" />
          </Field>
        )}
        {(f.scope === 'EXPENSE' || f.scope === 'TRAVEL') && (
          <Field label={f.scope === 'EXPENSE' ? 'Expense report code' : 'Trip code'} required error={errors.code} className="sm:col-span-2">
            <input className="input font-mono uppercase" placeholder={f.scope === 'EXPENSE' ? 'EX-2026-0042' : 'TR-2026-0007'} value={f.code} onChange={set('code')} />
          </Field>
        )}
        {f.scope === 'PERIOD' && (
          <>
            <Field label="Created from" required error={errors.from}><input type="date" className="input" value={f.from} max={f.to || undefined} onChange={set('from')} /></Field>
            <Field label="Created to" required><input type="date" className="input" value={f.to} min={f.from || undefined} onChange={set('to')} /></Field>
          </>
        )}
        <Field label="Reason" required error={errors.reason} hint="Shown on every held record" className="sm:col-span-2">
          <input className="input" maxLength={300} placeholder="e.g. GST audit FY 2022-23" value={f.reason} onChange={set('reason')} />
        </Field>
        <Field label="Case / ticket reference" hint="Optional" className="sm:col-span-2">
          <input className="input" maxLength={80} placeholder="e.g. LEGAL-1182" value={f.reference} onChange={set('reference')} />
        </Field>
      </div>
    </Modal>
  );
}
