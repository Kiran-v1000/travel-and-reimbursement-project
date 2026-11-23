import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../../app/store.js';
import { Field, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { ease } from '../../../shared/lib/motion.js';
import { authApi } from '../api/authApi.js';

// Seeded demo accounts - shown only in development builds.
const DEMO = [
  { email: 'rahul@voyage.io', name: 'Rahul Menon', role: 'Employee' },
  { email: 'neha@voyage.io', name: 'Neha Kapoor', role: 'Manager' },
  { email: 'vikram@voyage.io', name: 'Vikram Iyer', role: 'Director' },
  { email: 'sanjay@voyage.io', name: 'Sanjay Gupta', role: 'Finance' },
  { email: 'admin@utthunga.com', name: 'Divya Kulkarni', role: 'Admin', password: 'admin@123' },
  { email: 'auditor@voyage.io', name: 'Ravi Verma', role: 'Auditor' },
];

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const setSession = useAppStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { data: cfg } = useQuery({ queryKey: ['auth-config'], queryFn: authApi.config, staleTime: Infinity });
  const domains = cfg?.ssoDomains?.length ? cfg.ssoDomains.map((d) => `@${d}`).join(', ') : '@utthunga.com';

  // Errors returned from the Microsoft round-trip arrive as ?sso_error=...
  useEffect(() => {
    const e = params.get('sso_error');
    if (e) {
      setError(e);
      params.delete('sso_error');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  async function signIn(e, creds) {
    e?.preventDefault();
    const em = creds?.email ?? email;
    const pw = creds?.password ?? password;
    setBusy(true);
    setError(null);
    try {
      await authApi.login(em, pw);
      const me = await authApi.me();
      setSession(me.user, me.delegatedFrom);
      toast.success(`Welcome back, ${me.user.name.split(' ')[0]}`);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.fields ? 'Enter a valid email and password' : err.message);
    } finally {
      setBusy(false);
    }
  }

  function sso() {
    if (!cfg?.ssoEnabled) {
      toast.info('Microsoft sign-in is not switched on yet', { description: 'IT needs to add the Entra ID app details. Administrators can still sign in with a password.' });
      return;
    }
    setBusy(true);
    // Full-page navigation: the server redirects to Microsoft and back.
    window.location.assign(`/api/auth/sso/start?returnTo=${encodeURIComponent(location.state?.from || '/')}`);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className="w-full max-w-[420px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 text-[14px] text-muted">Request trips, claim expenses and track every reimbursement in one place.</p>
      </div>

      <button type="button" onClick={sso} disabled={busy} className="btn-secondary h-11 w-full text-[14px]">
        <MicrosoftLogo /> Sign in with Microsoft
      </button>
      <p className="mt-2 text-center text-[12px] text-muted">
        Use your {domains} work account{cfg && !cfg.ssoEnabled ? ' (not configured yet)' : ''}
      </p>

      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </motion.p>
      )}

      <div className="my-6 flex items-center gap-3 text-[11.5px] uppercase tracking-wider text-muted">
        <span className="h-px flex-1 bg-line" /> or administrator sign-in <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={signIn} className="space-y-4" noValidate>
        <Field label="Work email">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-11 pl-9" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@utthunga.com" required />
          </div>
        </Field>
        <Field label="Password">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-11 pl-9 pr-10" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <button type="submit" disabled={busy || !email || !password} className="btn-primary group h-11 w-full text-[14px]">
          {busy ? <Spinner /> : null} Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </form>

      {import.meta.env.DEV && (
      <div className="mt-8 rounded-2xl border border-dashed border-line p-4">
        <p className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> Demo accounts (development only)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              disabled={busy}
              onClick={() => {
                const pw = d.password ?? 'Voyage@123';
                setEmail(d.email);
                setPassword(pw);
                signIn(null, { email: d.email, password: pw });
              }}
              className="group flex items-center gap-2 rounded-xl border border-line bg-surface p-2 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card"
            >
              <Avatar name={d.name} size={26} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[12px] font-medium">{d.name.split(' ')[0]}</span>
                <span className="block text-[10.5px] text-muted">{d.role}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      )}
    </motion.div>
  );
}
