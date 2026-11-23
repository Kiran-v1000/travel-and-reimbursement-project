import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../../app/store.js';
import { ease } from '../../../shared/lib/motion.js';
import { ChangePasswordForm } from '../components/ChangePasswordForm.jsx';
import { useLogout } from '../hooks/useSession.js';

/** Shown after signing in with a temporary password - the rest of the app stays locked until it is replaced. */
export function ChangePasswordPage() {
  const user = useAppStore((s) => s.user);
  const navigate = useNavigate();
  const logout = useLogout();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className="w-full max-w-[420px]">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <h1 className="text-[26px] font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-7 mt-1.5 text-[14px] text-muted">
        Hi {user.name.split(' ')[0]}, you signed in with a temporary password. Pick your own before continuing.
      </p>
      <ChangePasswordForm submitLabel="Save and continue" onDone={() => navigate('/', { replace: true })} />
      <button type="button" onClick={logout} className="mt-4 w-full text-center text-[12.5px] text-muted hover:text-ink">
        Sign out instead
      </button>
    </motion.div>
  );
}
