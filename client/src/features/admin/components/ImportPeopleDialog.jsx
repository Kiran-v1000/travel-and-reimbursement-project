import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, ShieldCheck, Users, UserPlus, UserCog, GitBranch, Building2, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { api, get, download } from '../../../shared/lib/api.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Spinner } from '../../../shared/components/ui/primitives.jsx';
import { bytes } from '../../../shared/utils/format.js';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN');

/** Poll an import job until it finishes. */
function useJob(jobId) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    if (!jobId) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const j = await get(`/users/import/jobs/${jobId}`);
        if (stop) return;
        setJob(j);
        if (j.status === 'RUNNING') setTimeout(tick, 900);
      } catch (err) {
        if (!stop) setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);
  return job;
}

function Stat({ icon: Icon, label, value, tone = 'text-ink' }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="flex items-center gap-1.5 text-[11.5px] text-muted"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className={clsx('num mt-1 text-[20px] font-semibold tracking-tight', tone)}>{value}</p>
    </div>
  );
}

const errorsCsv = (errors) =>
  ['row,field,problem', ...errors.map((e) => [e.row, e.field, `"${String(e.message).replace(/"/g, '""')}"`].join(','))].join('\n');

/**
 * Bulk HR import: choose CSV → check (no changes) → import with progress.
 */
export function ImportPeopleDialog({ open, onClose }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [createMissing, setCreateMissing] = useState(true);
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [checkId, setCheckId] = useState(null);
  const [applyId, setApplyId] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = useJob(checkId);
  const apply = useJob(applyId);

  useEffect(() => {
    if (open) {
      setFile(null);
      setCheckId(null);
      setApplyId(null);
      setCreateMissing(true);
      setDeactivateMissing(false);
    }
  }, [open]);

  useEffect(() => {
    if (apply?.status === 'DONE') {
      toast.success(`Imported ${fmt(apply.totalRows)} people`, { description: 'Reporting lines and approval routes are up to date.' });
      ['admin', 'directory', 'reference'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    }
  }, [apply?.status, apply?.totalRows, qc]);

  async function start(mode) {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    form.append('createMissing', String(createMissing));
    form.append('deactivateMissing', String(deactivateMissing));
    try {
      const { data } = await api.post('/users/import', form, { timeout: 120_000 });
      mode === 'VALIDATE' ? setCheckId(data.jobId) : setApplyId(data.jobId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const choose = (f) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return toast.error('Please choose a .csv file');
    setFile(f);
    setCheckId(null);
    setApplyId(null);
  };

  const s = check?.summary ?? {};
  const checked = check?.status === 'DONE';
  const hasErrors = checked && (check.errors?.length ?? 0) > 0;
  const applying = apply && apply.status === 'RUNNING';
  const pct = apply ? Math.round((apply.processed / Math.max(apply.totalRows, 1)) * 100) : 0;
  const step = apply ? 3 : checked ? 2 : 1;

  const footer =
    apply?.status === 'DONE' ? (
      <button type="button" className="btn-primary" onClick={onClose}>Done</button>
    ) : (
      <>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
        {!checked || hasErrors || check?.status === 'FAILED' ? (
          <button type="button" className="btn-primary" disabled={!file || busy || check?.status === 'RUNNING'} onClick={() => start('VALIDATE')}>
            {(busy || check?.status === 'RUNNING') && <Spinner />} {hasErrors ? 'Check again' : 'Check file'}
          </button>
        ) : (
          <button type="button" className="btn-success" disabled={busy || applying} onClick={() => start('APPLY')}>
            {(busy || applying) && <Spinner />} Import {fmt(s.rows)} people
          </button>
        )}
      </>
    );

  return (
    <Modal open={open} onClose={applying ? () => {} : onClose} size="xl" title="Import people from CSV" description="Load or update employees, reporting lines, departments and cost centers from your HR system." footer={footer}>
      <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {['Choose file', 'Check', 'Import'].map((label, i) => (
          <li key={label} className="flex items-center gap-2" aria-current={step === i + 1 ? 'step' : undefined}>
            <span className={clsx('num flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold', step > i + 1 ? 'bg-ok text-white dark:text-slate-950' : step === i + 1 ? 'bg-brand text-white dark:text-slate-950' : 'bg-subtle text-muted')}>
              {step > i + 1 ? '✓' : i + 1}
            </span>
            <span className={step === i + 1 ? 'font-medium' : 'text-muted'}>{label}</span>
            {i < 2 && <span className="mx-1 h-px w-4 bg-line sm:w-8" aria-hidden />}
          </li>
        ))}
      </ol>

      {!apply && (
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0]); }}
            className={clsx('flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-5 transition-all', drag ? 'border-brand bg-brand/5' : 'border-line hover:border-brand/50 hover:bg-subtle/60')}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              {file ? <FileSpreadsheet className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
            </span>
            <div className="min-w-0 flex-1">
              {file ? (
                <>
                  <p className="truncate text-[14px] font-medium">{file.name}</p>
                  <p className="text-[12px] text-muted">{bytes(file.size)} · click to choose a different file</p>
                </>
              ) : (
                <>
                  <p className="text-[14px] font-medium">Drop your HR export here, or <span className="text-brand">browse</span></p>
                  <p className="text-[12px] text-muted">CSV with a header row · up to 200,000 people per file</p>
                </>
              )}
            </div>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files[0])} />
          </div>

          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <button type="button" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline" onClick={() => download('/users/import/template', {}, 'people-import-template.csv').catch((e) => toast.error(e.message))}>
              <Download className="h-3.5 w-3.5" /> Download template
            </button>
            <label className="flex items-start gap-2 text-[12.5px]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" checked={createMissing} onChange={(e) => { setCreateMissing(e.target.checked); setCheckId(null); }} />
              <span>Create departments and cost centers that don't exist yet</span>
            </label>
            <label className="flex items-start gap-2 text-[12.5px]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" checked={deactivateMissing} onChange={(e) => { setDeactivateMissing(e.target.checked); setCheckId(null); }} />
              <span>
                Deactivate people who are <strong>not</strong> in this file
                <span className="block text-[11.5px] text-muted">Use only with a complete export. Administrators are never deactivated.</span>
              </span>
            </label>
          </div>

          <p className="text-[12px] text-muted">
            Required columns: <code className="rounded bg-subtle px-1">employee_id</code>, <code className="rounded bg-subtle px-1">name</code>, <code className="rounded bg-subtle px-1">email</code>. People are matched by employee ID;
            <code className="mx-1 rounded bg-subtle px-1">manager_email</code> sets "reports to". Checking never changes anything.
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {check?.status === 'RUNNING' && !apply && (
          <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 flex items-center gap-3 rounded-xl bg-subtle p-4 text-[13px]">
            <Spinner className="text-brand" /> Checking {fmt(check.totalRows)} rows against the file and the system…
          </motion.div>
        )}
        {check?.status === 'FAILED' && !apply && (
          <motion.p key="check-failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 rounded-xl bg-bad/10 p-4 text-[13px] text-bad">{s.reason ?? 'The check failed.'}</motion.p>
        )}
        {checked && !apply && (
          <motion.div key="checked" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-4">
            <div className={clsx('flex items-center gap-2 rounded-xl p-3 text-[13px] font-medium', hasErrors ? 'bg-bad/10 text-bad' : 'bg-ok/10 text-ok')}>
              {hasErrors ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {hasErrors ? `${s.errorCount} problem${s.errorCount === 1 ? '' : 's'} found in ${fmt(s.invalidRows)} row(s). Fix the file and check again - nothing has been changed.` : `All ${fmt(s.rows)} rows look good. Nothing has been changed yet.`}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat icon={Users} label="Rows" value={fmt(s.rows)} />
              <Stat icon={UserPlus} label="New people" value={fmt(s.toCreate)} tone="text-ok" />
              <Stat icon={UserCog} label="Updated" value={fmt(s.toUpdate)} tone="text-brand-ink" />
              <Stat icon={GitBranch} label="Manager changes" value={fmt(s.managerChanges)} />
              <Stat icon={Building2} label="New depts / CCs" value={`${s.newDepartments?.length ?? 0} / ${s.newCostCenters?.length ?? 0}`} />
              <Stat icon={UserX} label="Deactivated" value={fmt(s.toDeactivate)} tone={s.toDeactivate ? 'text-warn' : 'text-ink'} />
            </div>
            {(s.newDepartments?.length > 0 || s.newCostCenters?.length > 0) && (
              <p className="text-[12px] text-muted">Will create {[...(s.newDepartments ?? []).map((d) => `department ${d}`), ...(s.newCostCenters ?? []).map((c) => `cost center ${c}`)].join(', ')}.</p>
            )}
            {hasErrors && (
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-subtle/60 px-4 py-2">
                  <p className="text-[12.5px] font-semibold">Problems to fix</p>
                  <button type="button" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline" onClick={() => {
                    const url = URL.createObjectURL(new Blob([errorsCsv(check.errors)], { type: 'text/csv' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'import-problems.csv';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}>
                    <Download className="h-3.5 w-3.5" /> Download list
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
                      <tr><th className="px-4 py-2 font-semibold">Row</th><th className="px-2 py-2 font-semibold">Column</th><th className="px-2 py-2 font-semibold">Problem</th></tr>
                    </thead>
                    <tbody>
                      {check.errors.map((e, i) => (
                        <tr key={i} className="border-t border-line/60">
                          <td className="num px-4 py-1.5 font-medium">{e.row}</td>
                          <td className="px-2 py-1.5 font-mono text-[11.5px] text-muted">{e.field}</td>
                          <td className="px-2 py-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {apply && (
          <motion.div key="apply" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {apply.status === 'RUNNING' && (
              <div className="rounded-2xl border border-line p-5">
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2 font-medium"><Spinner className="text-brand" /> Importing people…</span>
                  <span className="num text-muted">{fmt(apply.processed)} / {fmt(apply.totalRows)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                  <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${Math.max(pct, 4)}%` }} transition={{ duration: 0.4 }} />
                </div>
                <p className="mt-2 text-[12px] text-muted">You can keep this window open; the last step rebuilds every reporting line.</p>
              </div>
            )}
            {apply.status === 'DONE' && (
              <div className="flex flex-col items-center rounded-2xl bg-ok/[0.07] px-6 py-8 text-center">
                <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4 }} className="flex h-14 w-14 items-center justify-center rounded-full bg-ok text-white dark:text-slate-950">
                  <CheckCircle2 className="h-7 w-7" />
                </motion.span>
                <p className="mt-3 text-[16px] font-semibold">Import complete</p>
                <p className="mt-1 text-[13px] text-muted">
                  {fmt(apply.summary.toCreate)} added · {fmt(apply.summary.toUpdate)} updated · {fmt(apply.summary.managerChanges)} reporting lines set
                  {apply.summary.toDeactivate ? ` · ${fmt(apply.summary.toDeactivate)} deactivated` : ''}
                </p>
              </div>
            )}
            {apply.status === 'FAILED' && (
              <p className="rounded-xl bg-bad/10 p-4 text-[13px] text-bad">{apply.summary?.reason ?? 'The import failed. Nothing was changed.'}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
