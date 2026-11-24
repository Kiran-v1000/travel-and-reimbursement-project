import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Bell, CheckCheck, CircleAlert, CircleCheck, Undo2, Wallet, Info, BellRing, UserCheck } from 'lucide-react';
import { ago } from '../../../shared/utils/format.js';
import { pop } from '../../../shared/lib/motion.js';
import { notificationsApi } from '../api/notificationsApi.js';

const ICON = {
  ACTION_REQUIRED: [CircleAlert, 'text-brand bg-brand/10'],
  APPROVED: [CircleCheck, 'text-ok bg-ok/10'],
  PAID: [Wallet, 'text-ok bg-ok/10'],
  RETURNED: [Undo2, 'text-warn bg-warn/10'],
  REJECTED: [CircleAlert, 'text-bad bg-bad/10'],
  REMINDER: [BellRing, 'text-warn bg-warn/10'],
  DELEGATION: [UserCheck, 'text-brand bg-brand/10'],
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: notificationsApi.list, refetchInterval: 30_000 });
  const readAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = data?.unread ?? 0;

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  async function openItem(n) {
    setOpen(false);
    if (!n.read) notificationsApi.read(n.id).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
    if (n.link) navigate(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost relative h-9 w-9 px-0" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="num absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white ring-2 ring-surface dark:text-slate-950">
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...pop} className="absolute right-0 z-40 mt-2 w-[min(380px,calc(100vw-24px))] origin-top-right overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[14px] font-semibold">Notifications</p>
              {unread > 0 && (
                <button type="button" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline" onClick={() => readAll.mutate()}>
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {!data?.items?.length ? (
                <p className="px-4 py-10 text-center text-[13px] text-muted">You&apos;re all caught up.</p>
              ) : (
                data.items.map((n) => {
                  const [Icon, tone] = ICON[n.type] ?? [Info, 'text-info bg-info/10'];
                  return (
                    <button key={n.id} type="button" onClick={() => openItem(n)} className={clsx('flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-subtle', !n.read && 'bg-brand/[0.035]')}>
                      <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', tone)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="flex-1 text-[13px] font-medium leading-snug">{n.title}</span>
                          {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"><span className="sr-only">Unread</span></span>}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-muted">{ago(n.createdAt)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
