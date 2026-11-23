import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { UserCheck, Plus, CalendarRange, XCircle, Mail, MapPin, Building2, BadgeCheck, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, hasRole } from '../../../app/store.js';
import { get, post, del } from '../../../shared/lib/api.js';
import { PageHeader, Field, Spinner, EmptyState } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { UserPicker } from '../../../shared/components/UserPicker.jsx';
import { date, isoDay } from '../../../shared/utils/format.js';
import { ROLE_LABEL } from '../../../shared/utils/status.js';

export function ProfilePage() {
  const user = useAppStore((s) => s.user);
  const qc = useQueryClient();
  const { data: delegations = [] } = useQuery({ queryKey: ['delegations'], queryFn: () => get('/users/delegations') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ delegateId: '', scope: 'ALL', startDate: isoDay(new Date()), endDate: isoDay(new Date(Date.now() + 7 * 86400000)), reason: '' });
  const canDelegate = hasRole(user, 'MANAGER', 'FINANCE', 'ADMIN');
  const create = useMutation({
    mutationFn: () => post('/users/delegations', { ...form, reason: form.reason || undefined }),
    onSuccess: () => { toast.success('Delegation created', { description: 'Your delegate has been notified.' }); setOpen(false); qc.invalidateQueries({ queryKey: ['delegations'] }); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id) => del(`/users/delegations/${id}`),
    onSuccess: () => { toast.success('Delegation revoked'); qc.invalidateQueries({ queryKey: ['delegations'] }); },
    onError: (e) => toast.error(e.message),
  });
  const now = new Date();
  const state = (d) => (d.revoked ? 'Revoked' : new Date(d.endDate) < now ? 'Ended' : new Date(d.startDate) > now ? 'Scheduled' : 'Active');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker="Account" title="Profile & delegation" />
      <div className="card mb-6 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />
        <div className="-mt-10 flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <Avatar name={user.name} size={80} className="ring-4 ring-surface" />
          <div className="flex-1">
            <h2 className="text-[20px] font-semibold tracking-tight">{user.name}</h2>
            <p className="text-[13px] text-muted">{user.title} · {ROLE_LABEL[user.role]}</p>
          </div>
        </div>
        <dl className="grid gap-4 border-t border-line px-6 py-5 text-[13px] sm:grid-cols-2">
          {[
            [Mail, 'Email', user.email], [BadgeCheck, 'Employee ID', user.employeeId], [Building2, 'Department', user.department?.name],
            [Briefcase, 'Cost center', user.costCenter ? `${user.costCenter.code} · ${user.costCenter.name}` : '—'], [UserCheck, 'Reports to', user.manager?.name ?? '—'], [MapPin, 'Location', user.location ?? '—'],
          ].map(([Icon, k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-muted" />
              <dt className="w-28 text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Approval delegation</h2>
            <p className="text-[12.5px] text-muted">Going on leave? Let someone approve on your behalf for a set period. Every decision records both names.</p>
          </div>
          {canDelegate && <button type="button" className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Delegate</button>}
        </div>
        {!delegations.length ? (
          <EmptyState icon={CalendarRange} title="No delegations" body={canDelegate ? 'Set one up before you travel or take leave.' : 'Delegations you receive will show here.'} />
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {delegations.map((d) => {
                const outgoing = d.delegatorId === user.id;
                const s = state(d);
                return (
                  <motion.li key={d.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3 border-b border-line/60 px-5 py-4 last:border-0 sm:flex-row sm:items-center">
                    <div className="flex -space-x-2"><Avatar name={d.delegator.name} size={34} ring /><Avatar name={d.delegate.name} size={34} ring /></div>
                    <div className="min-w-0 flex-1 text-[13px]">
                      <p><span className="font-medium">{outgoing ? 'You' : d.delegator.name}</span> → <span className="font-medium">{outgoing ? d.delegate.name : 'you'}</span> · {d.scope === 'ALL' ? 'all approvals' : `${d.scope.toLowerCase()} approvals`}</p>
                      <p className="text-[12px] text-muted">{date(d.startDate)} – {date(d.endDate)}{d.reason && ` · ${d.reason}`}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${s === 'Active' ? 'bg-ok/10 text-ok' : s === 'Scheduled' ? 'bg-info/10 text-info' : 'bg-subtle text-muted'}`}>{s}</span>
                    {outgoing && ['Active', 'Scheduled'].includes(s) && (
                      <button type="button" className="btn-ghost text-bad" onClick={() => revoke.mutate(d.id)}><XCircle className="h-4 w-4" /> Revoke</button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delegate your approvals"
        size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn-primary" disabled={!form.delegateId || create.isPending} onClick={() => create.mutate()}>{create.isPending && <Spinner />} Create delegation</button></>}
      >
        <div className="space-y-4">
          <Field label="Delegate to" required>
            <UserPicker value={form.delegateId || null} excludeId={user.id} onChange={(id) => setForm({ ...form, delegateId: id ?? '' })} placeholder="Search for a colleague…" ariaLabel="Delegate to" />
          </Field>
          <Field label="What can they approve?">
            <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="ALL">Travel and expenses</option>
              <option value="TRAVEL">Travel requests only</option>
              <option value="EXPENSE">Expense reports only</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="Until"><input type="date" className="input" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
          <Field label="Reason (optional)"><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Annual leave" /></Field>
        </div>
      </Modal>
    </div>
  );
}
