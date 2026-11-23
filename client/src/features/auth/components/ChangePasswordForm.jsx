import { useState } from 'react';
import clsx from 'clsx';
import { Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../../app/store.js';
import { Field, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { authApi } from '../api/authApi.js';

// Mirrors the server rule (reference-data.js passwordProblem).
const RULES = [
  { label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { label: 'Upper and lower case letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A symbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** Change your own password. Calls onDone() after success (the session is refreshed). */
export function ChangePasswordForm({ onDone, submitLabel = 'Change password' }) {
  const setSession = useAppStore((s) => s.setSession);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const passed = RULES.map((r) => r.test(next));
  const strong = passed.every(Boolean);
  const matches = next.length > 0 && next === confirm;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!strong) return setError('The new password does not meet all the rules yet.');
    if (!matches) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      const me = await authApi.changePassword(current, next);
      setSession(me.user, me.delegatedFrom);
      toast.success('Password changed', { description: 'Other sessions using the old password have been signed out.' });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Current password">
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-11 pl-9" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
      </Field>
      <Field label="New password">
        <div className="relative">
          <input className="input h-11 pr-10" type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5" aria-label="Password rules">
        {RULES.map((r, i) => (
          <li key={r.label} className={clsx('flex items-center gap-1.5 text-[12px] transition-colors', passed[i] ? 'text-ok' : 'text-muted')}>
            <span className={clsx('flex h-4 w-4 items-center justify-center rounded-full border', passed[i] ? 'border-ok bg-ok text-white dark:text-slate-950' : 'border-line')}>
              {passed[i] && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
            </span>
            {r.label}
          </li>
        ))}
      </ul>
      <Field label="Confirm new password" error={confirm && !matches ? 'Does not match the new password' : null}>
        <input className="input h-11" type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      {error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{error}</p>}
      <button type="submit" className="btn-primary h-11 w-full text-[14px]" disabled={busy || !current || !strong || !matches}>
        {busy && <Spinner />} {submitLabel}
      </button>
    </form>
  );
}
