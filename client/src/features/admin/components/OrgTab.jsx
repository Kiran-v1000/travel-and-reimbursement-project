import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Field, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { UserPicker } from '../../../shared/components/UserPicker.jsx';
import { dateTime } from '../../../shared/utils/format.js';
import { adminApi } from '../api/adminApi.js';

function CurrencyRow({ c }) {
  const qc = useQueryClient();
  const [rate, setRate] = useState(String(Number(c.rateToBase)));
  const save = useMutation({
    mutationFn: () => adminApi.saveCurrency(c.code, { name: c.name, symbol: c.symbol, rateToBase: Number(rate), active: c.active }),
    onSuccess: () => { toast.success(`${c.code} rate updated`); qc.invalidateQueries({ queryKey: ['admin', 'currencies'] }); qc.invalidateQueries({ queryKey: ['reference'] }); },
    onError: (e) => toast.error(e.message),
  });
  const dirty = Number(rate) !== Number(c.rateToBase);
  return (
    <tr className="border-t border-line/60">
      <td className="px-5 py-2.5"><span className="font-mono font-medium">{c.code}</span> <span className="text-muted">· {c.name}</span></td>
      <td className="px-3 py-2"><div className="flex items-center justify-end gap-2"><span className="text-[12px] text-muted">1 {c.code} =</span><input type="number" step="0.0001" className="input num h-8 w-28 text-right" value={rate} disabled={c.code === 'INR'} onChange={(e) => setRate(e.target.value)} aria-label={`Rate for ${c.code}`} /><span className="text-[12px] text-muted">INR</span></div></td>
      <td className="hidden px-3 py-2.5 text-[12px] text-muted md:table-cell">{dateTime(c.updatedAt)}</td>
      <td className="w-24 px-3 py-2 text-right">{dirty && <button type="button" className="btn-primary h-8" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Spinner /> : <Check className="h-3.5 w-3.5" />} Save</button>}</td>
    </tr>
  );
}

export function OrgTab() {
  const qc = useQueryClient();
  const { data: currencies = [] } = useQuery({ queryKey: ['admin', 'currencies'], queryFn: adminApi.currencies });
  const { data: depts = [] } = useQuery({ queryKey: ['admin', 'departments'], queryFn: adminApi.departments });
  const { data: ccs = [] } = useQuery({ queryKey: ['admin', 'cost-centers'], queryFn: adminApi.costCenters });
  const [edit, setEdit] = useState(null);
  const save = useMutation({
    mutationFn: () => (edit.kind === 'dept' ? adminApi.saveDepartment(edit.id, { code: edit.code, name: edit.name, headId: edit.headId || null }) : adminApi.saveCostCenter(edit.id, { code: edit.code, name: edit.name, active: edit.active ?? true })),
    onSuccess: () => { toast.success('Saved'); setEdit(null); ['admin', 'reference'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4"><h3 className="text-[14.5px] font-semibold">Exchange rates</h3><p className="text-[12.5px] text-muted">Administrator-entered rates. Each expense line stores the rate and date it used.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><tbody>{currencies.map((c) => <CurrencyRow key={`${c.code}-${c.updatedAt}`} c={c} />)}</tbody></table></div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {[['Departments', depts, 'dept'], ['Cost centers', ccs, 'cc']].map(([title, rows, kind]) => (
          <section key={kind} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-[14.5px] font-semibold">{title}</h3>
              <button type="button" className="btn-secondary h-8" onClick={() => setEdit({ kind, code: '', name: '', headId: '' })}><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            <ul>
              {rows.map((r) => (
                <li key={r.id} className="table-row flex items-center gap-3 border-b border-line/60 px-5 py-2.5 text-[13px] last:border-0">
                  <span className="w-16 font-mono text-[12px] text-muted">{r.code}</span>
                  <span className="flex-1 font-medium">{r.name}</span>
                  {kind === 'dept' && <span className="text-[12px] text-muted">{r.head?.name ?? 'No head'} · {r._count?.members ?? 0} people</span>}
                  <button type="button" className="btn-ghost h-8 w-8 px-0" onClick={() => setEdit({ kind, ...r, headId: r.headId ?? '' })} aria-label={`Edit ${r.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} size="sm" title={edit?.id ? `Edit ${edit.name}` : `New ${edit?.kind === 'dept' ? 'department' : 'cost center'}`}
        footer={<><button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} Save</button></>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Code"><input className="input font-mono" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            {edit.kind === 'dept' && <Field label="Department head" hint="Used by 'Department head' approval levels"><UserPicker value={edit.headId || null} onChange={(id) => setEdit({ ...edit, headId: id ?? '' })} ariaLabel="Department head" /></Field>}
          </div>
        )}
      </Modal>
    </div>
  );
}
