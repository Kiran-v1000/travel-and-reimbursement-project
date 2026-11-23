import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Pencil, FileUp } from 'lucide-react';
import { ImportPeopleDialog } from './ImportPeopleDialog.jsx';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Field, Spinner, SkeletonRows } from '../../../shared/components/ui/primitives.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { useDebounce, useReference } from '../../../shared/hooks/index.js';
import { UserPicker } from '../../../shared/components/UserPicker.jsx';
import { ROLE_LABEL } from '../../../shared/utils/status.js';
import { ago } from '../../../shared/utils/format.js';
import { adminApi } from '../api/adminApi.js';

const blank = { employeeId: '', name: '', email: '', role: 'EMPLOYEE', title: '', location: '', departmentId: '', costCenterId: '', managerId: '', active: true, password: '' };

export function PeopleTab() {
  const qc = useQueryClient();
  const { data: ref } = useReference();
  const [search, setSearch] = useState('');
  const term = useDebounce(search);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'users', term],
    queryFn: ({ pageParam }) => adminApi.users({ search: term || undefined, page: pageParam, pageSize: 50 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const users = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(blank);
  const [importing, setImporting] = useState(false);

  const open = (u) => {
    setForm(u ? { ...blank, ...u, departmentId: u.department?.id ?? '', costCenterId: u.costCenter?.id ?? '', managerId: u.manager?.id ?? '', title: u.title ?? '', location: u.location ?? '', password: '' } : blank);
    setEdit(u ?? 'new');
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { employeeId: form.employeeId, name: form.name, email: form.email, role: form.role, title: form.title || null, location: form.location || null, departmentId: form.departmentId || null, costCenterId: form.costCenterId || null, managerId: form.managerId || null, active: form.active, ...(form.password ? { password: form.password } : {}) };
      return edit === 'new' ? adminApi.createUser(body) : adminApi.updateUser(edit.id, body);
    },
    onSuccess: () => { toast.success('Saved'); setEdit(null); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); qc.invalidateQueries({ queryKey: ['directory'] }); },
    onError: (e) => toast.error(e.message),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-9 pl-9" placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" />
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" /> Import CSV</button>
          <button type="button" className="btn-primary" onClick={() => open(null)}><Plus className="h-4 w-4" /> Add person</button>
        </div>
      </div>
      <ImportPeopleDialog open={importing} onClose={() => setImporting(false)} />
      {isLoading ? <SkeletonRows /> : (
        <ul>
          {users.map((u) => (
            <li key={u.id} className={clsx('table-row flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0', !u.active && 'opacity-55')}>
              <Avatar name={u.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{u.name} <span className="text-[12px] font-normal text-muted">· {u.employeeId}</span></p>
                <p className="truncate text-[12px] text-muted">{u.title} · {u.department?.name ?? 'No department'} · reports to {u.manager?.name ?? '—'}</p>
              </div>
              {u.azureOid && <span className="hidden rounded-full bg-info/10 px-2 py-0.5 text-[11.5px] font-medium text-info sm:inline" title="Signs in with Microsoft">Microsoft SSO</span>}
              <span className="hidden rounded-full bg-brand/10 px-2 py-0.5 text-[11.5px] font-medium text-brand-ink sm:inline">{ROLE_LABEL[u.role]}</span>
              <span className="hidden w-24 text-right text-[11.5px] text-muted md:block">{u.lastLoginAt ? ago(u.lastLoginAt) : 'Never'}</span>
              <button type="button" className="btn-ghost h-8 w-8 px-0" onClick={() => open(u)} aria-label={`Edit ${u.name}`}><Pencil className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {!isLoading && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12.5px] text-muted">
          <span className="num">Showing {users.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} people</span>
          {hasNextPage && (
            <button type="button" className="btn-secondary h-8" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage && <Spinner />} Load more
            </button>
          )}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit === 'new' ? 'Add person' : `Edit ${edit?.name ?? ''}`}
        footer={<><button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} Save</button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
          <Field label="Employee ID" required><input className="input" value={form.employeeId} onChange={set('employeeId')} /></Field>
          <Field label="Work email" required><input className="input" type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Role"><select className="input" value={form.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Job title"><input className="input" value={form.title} onChange={set('title')} /></Field>
          <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
          <Field label="Department"><select className="input" value={form.departmentId} onChange={set('departmentId')}><option value="">—</option>{ref?.departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Cost center"><select className="input" value={form.costCenterId} onChange={set('costCenterId')}><option value="">—</option>{ref?.costCenters?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <Field label="Reports to" hint="Drives the approval hierarchy"><UserPicker value={form.managerId || null} excludeId={edit?.id} onChange={(id) => setForm((f) => ({ ...f, managerId: id ?? '' }))} placeholder="No manager - search to assign" ariaLabel="Reports to" /></Field>
          <Field label={edit === 'new' ? 'Initial password' : 'Reset password'} hint="At least 8 characters; leave blank to keep"><input className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={form.active} onChange={set('active')} /> Active (inactive approvers are routed to the fallback approver)</label>
        </div>
      </Modal>
    </section>
  );
}
