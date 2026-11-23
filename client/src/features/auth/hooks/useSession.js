import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../app/store.js';
import { queryClient } from '../../../app/providers.jsx';
import { setUnauthorizedHandler } from '../../../shared/lib/api.js';
import { authApi } from '../api/authApi.js';

/** Restore the session on load and sign out cleanly on any 401. */
export function useSessionBootstrap() {
  const { setSession, clearSession } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!useAppStore.getState().user) return;
      clearSession();
      queryClient.clear();
      navigate('/login', { replace: true });
    });
    // Only a real 401 ends the session; a restarting or unreachable server is retried.
    let cancelled = false;
    const restore = async (attempt = 0) => {
      try {
        const r = await authApi.me();
        if (!cancelled) setSession(r.user, r.delegatedFrom);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401 || attempt >= 4) clearSession();
        else setTimeout(() => restore(attempt + 1), 600 * 2 ** attempt);
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useLogout() {
  const clearSession = useAppStore((s) => s.clearSession);
  const navigate = useNavigate();
  return async () => {
    await authApi.logout().catch(() => {});
    clearSession();
    queryClient.clear();
    navigate('/login', { replace: true });
  };
}
