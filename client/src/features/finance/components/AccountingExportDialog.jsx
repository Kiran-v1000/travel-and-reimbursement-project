import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileCode2, History } from 'lucide-react';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Field, Segmented, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { money, date, dateTime, isoDay } from '../../../shared/utils/format.js';
import { financeApi } from '../api/financeApi.js';

const FORMATS = [
  { value: 'CSV', label: 'CSV journal' },
  { value: 'TALLY', label: 'Tally XML' },
];

function lastMonth() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { from: isoDay(from), to: isoDay(to) };
}

/**
 * Finance → Accounting export. Paid reimbursements in a date range become one batch;
 * a payment is only ever exported once, and past batches can be downloaded again.
 */
export function AccountingExportDialog({ open, onClose }) {
  const qc = useQueryClient();
  const [range, setRange] = useState(lastMonth);
  const [format, setFormat] = useState('CSV');
  const [busyId, setBusyId] = useState(null);
  const valid = range.from && range.to && range.from <= range.to;

  const preview = useQuery({
    queryKey: ['finance', 'export-preview', range.from, range.to],
    queryFn: () => financeApi.exportPreview(range),
    enabled: open && !!valid,
  });
  const history = useQuery({ queryKey: ['finance', 'exports'], queryFn: financeApi.exports, enabled: open });

  const fetchFile = async (batch) => {
    setBusyId(batch.id);
    try {
      await financeApi.downloadExport(batch);
    } catch (e) {
      toast.error(e.message || 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const create = useMutation({
    mutationFn: () => financeApi.createExport({ ...range, format }),
    onSuccess: async (batch) => {
      toast.success(`${batch.payments} reimbursements exported`);
      qc.invalidateQueries({ queryKey: ['finance', 'export-preview'] });
      qc.invalidateQueries({ queryKey: ['finance', 'exports'] });
      await fetchFile(batch);
    },
    onError: (e) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ['finance', 'export-preview'] });
    },
  });

  const p = preview.data;
  const nothing = p && p.payments === 0;

  const footer = (
    <>
      <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
      <button type="button" className="btn-primary" disabled={!valid || !p || nothing || create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        Export {p && !nothing ? `${p.payments.toLocaleString('en-IN')} payments` : ''}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={create.isPending ? () => {} : onClose} size="lg" title="Accounting export" description="Book paid reimbursements into your ledger. Each payment is exported only once." footer={footer}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paid from" required>
          <input type="date" className="input" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </Field>
        <Field label="Paid to" required error={range.from && range.to && !valid ? 'Must be on or after the start date' : undefined}>
          <input type="date" className="input" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </Field>
      </div>

      <div className="mt-4">
        <p className="label">Format</p>
        <Segmented options={FORMATS} value={format} onChange={setFormat} />
        <p className="mt-1.5 text-[12px] text-muted">
          {format === 'CSV'
            ? 'Double-entry journal: a debit per expense line to its ledger, a credit per payment to the bank ledger. Opens in Excel or imports into most accounting tools.'
            : 'One Payment voucher per reimbursement, ready for Tally → Import Data → Vouchers. Create the ledgers in Tally first.'}
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`${range.from}${range.to}${p?.payments}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="mt-5 rounded-2xl border border-line bg-subtle/50 p-4" aria-live="polite">
          {!valid ? (
            <p className="text-[13px] text-muted">Choose a date range.</p>
          ) : preview.isLoading ? (
            <p className="flex items-center gap-2 text-[13px] text-muted"><Spinner className="h-4 w-4" /> Checking payments…</p>
          ) : preview.isError ? (
            <p className="text-[13px] text-bad">{preview.error.message}</p>
          ) : nothing ? (
            <p className="flex items-center gap-2 text-[13px]"><CheckCircle2 className="h-4 w-4 text-ok" /> Nothing left to export in this period{p.alreadyExported ? ` — ${p.alreadyExported.toLocaleString('en-IN')} payments were exported earlier.` : '.'}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Payments" value={p.payments.toLocaleString('en-IN')} />
                <Stat label="Expense lines" value={p.lines.toLocaleString('en-IN')} />
                <Stat label="Total paid" value={money(p.total)} />
              </div>
              {p.alreadyExported > 0 && <p className="mt-3 text-[12px] text-muted">{p.alreadyExported.toLocaleString('en-IN')} payments in this period were exported earlier and will be skipped.</p>}
              {p.unmappedLines > 0 && (
                <p className="mt-3 flex items-start gap-2 text-[12px] text-warn">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {p.unmappedLines} lines are in categories without a ledger and will go to “Unmapped Expenses”. Set ledgers in Administration → Policy.
                </p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6">
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><History className="h-4 w-4 text-muted" /> Past exports</h3>
        {history.isLoading ? (
          <p className="text-[12.5px] text-muted">Loading…</p>
        ) : !history.data?.length ? (
          <p className="text-[12.5px] text-muted">No exports yet.</p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            {history.data.map((b) => {
              const Icon = b.format === 'TALLY' ? FileCode2 : FileSpreadsheet;
              return (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{date(b.fromDate)} – {date(b.toDate)} · {b.format === 'TALLY' ? 'Tally XML' : 'CSV'}</p>
                    <p className="truncate text-[11.5px] text-muted">{b.payments.toLocaleString('en-IN')} payments · {money(b.total)} · {b.createdBy?.name} · {dateTime(b.createdAt)}</p>
                  </div>
                  <button type="button" className="btn-ghost h-8 px-2.5 text-[12.5px]" disabled={busyId === b.id} onClick={() => fetchFile(b)} aria-label={`Download export of ${date(b.fromDate)} to ${date(b.toDate)}`}>
                    {busyId === b.id ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} Download
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="num text-[16px] font-semibold tracking-tight">{value}</p>
    </div>
  );
}
