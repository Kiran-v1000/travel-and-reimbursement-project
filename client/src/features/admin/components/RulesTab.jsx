import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import clsx from 'clsx';
import { Plus, GitBranch, Trash2, GripVertical, FlaskConical, Pencil, ArrowDown, Plane, Receipt, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Field, Spinner, SkeletonRows } from '../../../shared/components/ui/primitives.jsx';
import { RoutePreview } from '../../../shared/components/RoutePreview.jsx';
import { useDirectory, useReference } from '../../../shared/hooks/index.js';
import { money } from '../../../shared/utils/format.js';
import { adminApi } from '../api/adminApi.js';

const TYPES = [
  { v: 'MANAGER', label: 'Reporting manager' },
  { v: 'SKIP_MANAGER', label: "Manager's manager" },
  { v: 'DEPT_HEAD', label: 'Department head' },
  { v: 'TOP_OF_LINE', label: 'Top of reporting line (CEO)' },
  { v: 'ROLE', label: 'Anyone with role' },
  { v: 'USER', label: 'Specific person' },
];
const blankRule = { name: '', entityType: 'TRAVEL', priority: 100, minAmount: 0, maxAmount: '', departmentId: '', costCenterCode: '', travelType: '', onPolicyException: false, active: true, levels: [{ id: 1, label: 'Reporting manager', approvers: [{ type: 'MANAGER' }] }] };
let uid = 100;

function describe(rule, people) {
  const name = (s) => (s.type === 'ROLE' ? `any ${s.role?.toLowerCase()}` : s.type === 'USER' ? people.find((p) => p.id === s.userId)?.name ?? 'a person' : TYPES.find((t) => t.v === s.type)?.label.toLowerCase());
  return rule.levels.map((l) => l.approvers.map(name).join(' + ')).join(' → ');
}

function RuleEditor({ open, onClose, rule }) {
  const qc = useQueryClient();
  const { data: ref } = useReference();
  const { data: people = [] } = useDirectory();
  const [r, setR] = useState(blankRule);
  useEffect(() => {
    if (open) setR(rule ? { ...rule, maxAmount: rule.maxAmount ?? '', departmentId: rule.departmentId ?? '', costCenterCode: rule.costCenterCode ?? '', travelType: rule.travelType ?? '', levels: rule.levels.map((l) => ({ ...l, id: ++uid })) } : { ...blankRule, levels: blankRule.levels.map((l) => ({ ...l, id: ++uid })) });
  }, [open, rule]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...r, minAmount: Number(r.minAmount) || 0, maxAmount: r.maxAmount === '' ? null : Number(r.maxAmount), departmentId: r.departmentId || null, costCenterCode: r.costCenterCode || null, travelType: r.entityType === 'TRAVEL' && r.travelType ? r.travelType : null, levels: r.levels.map(({ id, ...l }) => l) };
      delete body.id; delete body.version; delete body.createdAt; delete body.updatedAt; delete body.department;
      return rule ? adminApi.updateRule(rule.id, body) : adminApi.createRule(body);
    },
    onSuccess: () => { toast.success(rule ? `Rule updated (v${rule.version + 1})` : 'Rule created', { description: 'Takes effect for new submissions. In-flight items keep their original route.' }); qc.invalidateQueries({ queryKey: ['admin', 'rules'] }); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const setLevel = (id, patch) => setR((x) => ({ ...x, levels: x.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const set = (k) => (e) => setR((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  return (
    <Modal open={open} onClose={onClose} size="xl" title={rule ? `Edit rule · v${rule.version}` : 'New approval rule'} description="Rules are checked by priority (lowest first). Exception rules win whenever a request breaks policy."
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={save.isPending || r.name.length < 3 || !r.levels.length} onClick={() => save.mutate()}>{save.isPending && <Spinner />} Save rule</button></>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <Field label="Rule name" required><input className="input" value={r.name} onChange={set('name')} placeholder="e.g. International travel" /></Field>
          <div className="grid grid-cols-2 gap-2">
            {[['TRAVEL', 'Travel', Plane], ['EXPENSE', 'Expenses', Receipt]].map(([v, l, I]) => (
              <button key={v} type="button" onClick={() => set('entityType')(v)} className={clsx('flex items-center gap-2 rounded-xl border p-3 text-[13px] font-medium transition-all', r.entityType === v ? 'border-brand bg-brand/[0.05] ring-4 ring-brand/10' : 'border-line')}><I className="h-4 w-4 text-brand" /> {l}</button>
            ))}
          </div>
          <p className="kicker pt-2">When does it apply?</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount from (INR)"><input type="number" className="input num" value={r.minAmount} onChange={set('minAmount')} /></Field>
            <Field label="Up to (blank = no limit)"><input type="number" className="input num" value={r.maxAmount} onChange={set('maxAmount')} /></Field>
            <Field label="Department"><select className="input" value={r.departmentId} onChange={set('departmentId')}><option value="">Any</option>{ref?.departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Cost center"><select className="input" value={r.costCenterCode} onChange={set('costCenterCode')}><option value="">Any</option>{ref?.costCenters?.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}</select></Field>
            {r.entityType === 'TRAVEL' && <Field label="Trip type"><select className="input" value={r.travelType} onChange={set('travelType')}><option value="">Any</option><option value="DOMESTIC">Domestic</option><option value="INTERNATIONAL">International</option></select></Field>}
            <Field label="Priority" hint="Lower runs first"><input type="number" className="input num" value={r.priority} onChange={set('priority')} /></Field>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-[13px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" checked={r.onPolicyException} onChange={set('onPolicyException')} />
            <span><span className="flex items-center gap-1 font-medium"><ShieldAlert className="h-3.5 w-3.5 text-warn" /> Only for policy exceptions</span><span className="text-[12px] text-muted">Adds scrutiny when a request is outside policy.</span></span>
          </label>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={r.active} onChange={set('active')} /> Active</label>
        </div>

        <div>
          <p className="kicker mb-3">Approval chain · drag to reorder</p>
          <Reorder.Group axis="y" values={r.levels} onReorder={(levels) => setR((x) => ({ ...x, levels }))} className="space-y-2">
            {r.levels.map((l, i) => (
              <Reorder.Item key={l.id} value={l} className="rounded-2xl border border-line bg-surface p-3 shadow-card">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 cursor-grab text-muted active:cursor-grabbing" />
                  <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white dark:text-slate-950">{i + 1}</span>
                  <input className="input h-8 flex-1" value={l.label} onChange={(e) => setLevel(l.id, { label: e.target.value })} aria-label="Level name" />
                  <button type="button" className="btn-ghost h-8 w-8 px-0 hover:text-bad" onClick={() => setR((x) => ({ ...x, levels: x.levels.filter((y) => y.id !== l.id) }))} aria-label="Remove level"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-2 space-y-2 pl-14">
                  {l.approvers.map((a, j) => (
                    <div key={j} className="flex flex-wrap gap-2">
                      <select className="input h-8 flex-1" value={a.type} onChange={(e) => setLevel(l.id, { approvers: l.approvers.map((x, k) => (k === j ? { type: e.target.value, ...(e.target.value === 'ROLE' ? { role: 'FINANCE' } : {}) } : x)) })}>
                        {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                      </select>
                      {a.type === 'ROLE' && <select className="input h-8 w-32" value={a.role} onChange={(e) => setLevel(l.id, { approvers: l.approvers.map((x, k) => (k === j ? { ...x, role: e.target.value } : x)) })}>{['FINANCE', 'ADMIN', 'MANAGER'].map((ro) => <option key={ro}>{ro}</option>)}</select>}
                      {a.type === 'USER' && <select className="input h-8 w-44" value={a.userId ?? ''} onChange={(e) => setLevel(l.id, { approvers: l.approvers.map((x, k) => (k === j ? { ...x, userId: e.target.value } : x)) })}><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                      {l.approvers.length > 1 && <button type="button" className="btn-ghost h-8 w-8 px-0" onClick={() => setLevel(l.id, { approvers: l.approvers.filter((_, k) => k !== j) })} aria-label="Remove approver"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                  {l.approvers.length < 5 && <button type="button" className="text-[12px] font-medium text-brand hover:underline" onClick={() => setLevel(l.id, { approvers: [...l.approvers, { type: 'MANAGER' }] })}>+ Parallel approver</button>}
                </div>
                {i < r.levels.length - 1 && <ArrowDown className="mx-auto -mb-5 mt-1 h-4 w-4 text-muted" />}
              </Reorder.Item>
            ))}
          </Reorder.Group>
          <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setR((x) => ({ ...x, levels: [...x.levels, { id: ++uid, label: `Level ${x.levels.length + 1}`, approvers: [{ type: 'DEPT_HEAD' }] }] }))}><Plus className="h-4 w-4" /> Add level</button>
        </div>
      </div>
    </Modal>
  );
}

function Simulator() {
  const { data: people = [] } = useDirectory();
  const [s, setS] = useState({ userId: '', entityType: 'TRAVEL', amount: 25000, travelType: 'DOMESTIC', hasException: false });
  const sim = useMutation({ mutationFn: () => adminApi.simulate({ ...s, amount: Number(s.amount) }), onError: (e) => toast.error(e.message) });
  return (
    <section className="card p-5">
      <h3 className="flex items-center gap-2 text-[14.5px] font-semibold"><FlaskConical className="h-4 w-4 text-brand" /> Test the routing</h3>
      <p className="mb-4 text-[12.5px] text-muted">Pick a person and an amount to see exactly who would approve it.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <select className="input xl:col-span-2" value={s.userId} onChange={(e) => setS({ ...s, userId: e.target.value })} aria-label="Employee"><option value="">Choose employee…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.title}</option>)}</select>
        <select className="input" value={s.entityType} onChange={(e) => setS({ ...s, entityType: e.target.value })} aria-label="Type"><option value="TRAVEL">Travel</option><option value="EXPENSE">Expense</option></select>
        {s.entityType === 'TRAVEL' ? <select className="input" value={s.travelType} onChange={(e) => setS({ ...s, travelType: e.target.value })} aria-label="Trip type"><option value="DOMESTIC">Domestic</option><option value="INTERNATIONAL">International</option></select> : <span className="hidden xl:block" />}
        <input type="number" className="input num" value={s.amount} onChange={(e) => setS({ ...s, amount: e.target.value })} aria-label="Amount in INR" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={s.hasException} onChange={(e) => setS({ ...s, hasException: e.target.checked })} /> Outside policy</label>
        <button type="button" className="btn-primary ml-auto" disabled={!s.userId || sim.isPending} onClick={() => sim.mutate()}>{sim.isPending && <Spinner />} Run test</button>
      </div>
      <AnimatePresence>{sim.data && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-subtle/60 p-4"><RoutePreview route={sim.data} /></motion.div>}</AnimatePresence>
    </section>
  );
}

export function RulesTab() {
  const qc = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ['admin', 'rules'], queryFn: adminApi.rules });
  const { data: people = [] } = useDirectory();
  const [edit, setEdit] = useState({ open: false, rule: null });
  const off = useMutation({ mutationFn: adminApi.deactivateRule, onSuccess: () => { toast.success('Rule deactivated'); qc.invalidateQueries({ queryKey: ['admin', 'rules'] }); } });

  return (
    <div className="space-y-6">
      <Simulator />
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div><h3 className="text-[14.5px] font-semibold">Routing rules</h3><p className="text-[12.5px] text-muted">Change routing by amount, organisation or trip type without code changes. Every edit creates a new version.</p></div>
          <button type="button" className="btn-primary" onClick={() => setEdit({ open: true, rule: null })}><Plus className="h-4 w-4" /> New rule</button>
        </div>
        {isLoading ? <SkeletonRows /> : ['TRAVEL', 'EXPENSE'].map((type) => (
          <div key={type}>
            <p className="kicker bg-subtle/50 px-5 py-2">{type === 'TRAVEL' ? 'Travel requests' : 'Expense reports'}</p>
            {rules.filter((r) => r.entityType === type).map((r) => (
              <div key={r.id} className={clsx('group flex flex-col gap-2 border-b border-line/60 px-5 py-3.5 sm:flex-row sm:items-center', !r.active && 'opacity-50')}>
                <span className="num w-10 text-[12px] text-muted">#{r.priority}</span>
                <GitBranch className="hidden h-4 w-4 text-brand sm:block" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13.5px] font-medium">{r.name}<span className="rounded-md bg-subtle px-1.5 py-0.5 text-[10.5px] text-muted">v{r.version}</span>{r.onPolicyException && <span className="rounded-md bg-warn/10 px-1.5 py-0.5 text-[10.5px] font-medium text-warn">Exceptions</span>}{!r.active && <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[10.5px]">Inactive</span>}</p>
                  <p className="truncate text-[12px] text-muted">
                    {[Number(r.minAmount) > 0 && `≥ ${money(r.minAmount)}`, r.maxAmount && `≤ ${money(r.maxAmount)}`, r.travelType && r.travelType.toLowerCase(), r.department?.name, r.costCenterCode].filter(Boolean).join(' · ') || 'Everything else'} → {describe(r, people)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost h-8" onClick={() => setEdit({ open: true, rule: r })}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  {r.active && <button type="button" className="btn-ghost h-8 hover:text-bad" onClick={() => off.mutate(r.id)}>Deactivate</button>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
      <RuleEditor open={edit.open} rule={edit.rule} onClose={() => setEdit({ open: false, rule: null })} />
    </div>
  );
}
