import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { get, post } from '../../../shared/lib/api.js';
import { Spinner } from '../../../shared/components/ui/primitives.jsx';
import { ago } from '../../../shared/utils/format.js';

/** A rough, human label for a browser user-agent string. */
function deviceLabel(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/** Profile → signed-in devices, with "Sign out other devices". */
export function SessionsCard() {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading } = useQuery({ queryKey: ['sessions'], queryFn: () => get('/auth/sessions') });
  const others = sessions.filter((s) => !s.current).length;
  const revoke = useMutation({
    mutationFn: () => post('/auth/sessions/revoke-others'),
    onSuccess: (r) => {
      toast.success(r.ended ? `Signed out ${r.ended} other device${r.ended > 1 ? 's' : ''}` : 'No other devices were signed in');
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="card mb-6 p-5" aria-labelledby="sessions-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><MonitorSmartphone className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 id="sessions-title" className="text-[15px] font-semibold">Signed-in devices</h2>
          <p className="text-[12.5px] text-muted">Sessions end after a period of inactivity. If you don't recognise a device, sign it out and change your password.</p>
        </div>
        <button type="button" className="btn-secondary" disabled={!others || revoke.isPending} onClick={() => revoke.mutate()}>
          {revoke.isPending ? <Spinner className="h-4 w-4" /> : <LogOut className="h-4 w-4" aria-hidden />} Sign out other devices
        </button>
      </div>
      {isLoading ? (
        <p className="text-[12.5px] text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-2xl border border-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <span className="font-medium">{deviceLabel(s.userAgent ?? '')}</span>
              {s.current && <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">This device</span>}
              <span className="text-muted">{s.method === 'SSO' ? 'Microsoft sign-in' : 'Password'} · active {ago(s.lastSeenAt)}{s.ip ? ` · ${s.ip}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
