import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Pencil, Send, Undo, Trash2, Receipt, MapPin, CalendarDays, Users, Briefcase, Globe2, Plane, ArrowRight, FileText, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../../app/store.js';
import { Skeleton, Tabs, Spinner } from '../../../shared/components/ui/primitives.jsx';
import { StatusChip } from '../../../shared/components/ui/StatusChip.jsx';
import { Avatar } from '../../../shared/components/ui/Avatar.jsx';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { ApprovalTimeline } from '../../../shared/components/ApprovalTimeline.jsx';
import { PolicyFlags, hasViolation } from '../../../shared/components/PolicyFlags.jsx';
import { FileDrop } from '../../../shared/components/FileDrop.jsx';
import { ActivityLog } from '../../../shared/components/ActivityLog.jsx';
import { StageProgress } from '../../../shared/components/StageProgress.jsx';
import { DecisionBar } from '../../../shared/components/DecisionBar.jsx';
import { money, date, nights, dateTime } from '../../../shared/utils/format.js';
import { TRAVEL_STAGES } from '../../../shared/utils/status.js';
import { ease } from '../../../shared/lib/motion.js';
import { useTravel, useTravelMutation } from '../hooks/useTravel.js';
import { travelApi } from '../api/travelApi.js';

export function TravelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const { data: t, isLoading, error, refetch } = useTravel(id);
  const [tab, setTab] = useState('approvals');
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');
  const submit = useTravelMutation((r) => travelApi.submit(id, r));
  const withdraw = useTravelMutation(() => travelApi.withdraw(id));
  const remove = useTravelMutation(() => travelApi.remove(id));

  if (isLoading) return <Skeleton className="h-[640px] rounded-2xl" />;
  if (error) return <div className="card p-10 text-center text-[14px]">{error.message}</div>;

  const mine = t.requesterId === user.id;
  const editable = mine && ['DRAFT', 'RETURNED'].includes(t.status);
  const needsReason = hasViolation(t.policyFlags) && !t.exceptionReason;
  const costs = [
    ['Transport', t.estTransport], ['Lodging', t.estLodging], ['Meals', t.estMeals], ['Other', t.estOther],
  ];
  const sum = costs.reduce((a, [, v]) => a + Number(v), 0);

  async function doSubmit() {
    try {
      await submit.mutateAsync(reason || undefined);
      toast.success('Submitted for approval');
      setConfirm(null);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-[12.5px] text-muted">
        <button type="button" onClick={() => navigate(-1)} className="btn-ghost h-8 px-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span>/</span>
        <Link to="/travel" className="hover:text-ink">Travel</Link>
        <span>/</span>
        <span className="font-mono text-ink">{t.code}</span>
      </div>

      <DecisionBar steps={t.steps} round={t.round} requesterId={t.requesterId} onDone={refetch} />

      <div className="card mb-6 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-glow">
              {t.travelType === 'INTERNATIONAL' ? <Globe2 className="h-5 w-5" /> : <Plane className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[20px] font-semibold tracking-tight md:text-[22px]">{t.title}</h1>
                <StatusChip status={t.status} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                <span className="font-mono">{t.code}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{t.origin} → {t.destination}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{date(t.startDate)} – {date(t.endDate)}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <>
                <Link to={`/travel/${id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit</Link>
                <button type="button" className="btn-primary" onClick={() => setConfirm('submit')}><Send className="h-4 w-4" /> {t.status === 'RETURNED' ? 'Resubmit' : 'Submit'}</button>
              </>
            )}
            {mine && ['PENDING', 'RETURNED'].includes(t.status) && (
              <button type="button" className="btn-secondary" onClick={() => setConfirm('withdraw')}><Undo className="h-4 w-4" /> Withdraw</button>
            )}
            {mine && t.status === 'DRAFT' && (
              <button type="button" className="btn-ghost text-bad" onClick={() => setConfirm('delete')}><Trash2 className="h-4 w-4" /> Delete</button>
            )}
            {mine && t.status !== 'DRAFT' && (
              <Link to={`/travel/new?copy=${id}`} className="btn-secondary" title="Start a new request with the same details"><Copy className="h-4 w-4" /> Duplicate</Link>
            )}
            {mine && t.status === 'APPROVED' && (
              <Link to={`/expenses/new?trip=${id}`} className="btn-primary"><Receipt className="h-4 w-4" /> Claim expenses</Link>
            )}
          </div>
        </div>
        <div className="mt-6">
          <StageProgress stages={TRAVEL_STAGES} status={t.status} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }} className="card p-5 md:p-6">
            <h2 className="mb-4 text-[15px] font-semibold">Trip summary</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="kicker mb-1">Business purpose</dt>
                <dd className="text-[13.5px] leading-relaxed">{t.purpose}</dd>
              </div>
              <div>
                <dt className="kicker mb-1">Requested by</dt>
                <dd className="flex items-center gap-2 text-[13px]"><Avatar name={t.requester.name} size={24} /> {t.requester.name} <span className="text-muted">· {t.requester.department?.name}</span></dd>
              </div>
              <div>
                <dt className="kicker mb-1">Travelers</dt>
                <dd className="flex items-center gap-1.5 text-[13px]"><Users className="h-3.5 w-3.5 text-muted" />{t.travelers.join(', ') || t.requester.name}</dd>
              </div>
              <div>
                <dt className="kicker mb-1">Duration</dt>
                <dd className="text-[13px]">{nights(t.startDate, t.endDate)} nights · {t.travelType === 'INTERNATIONAL' ? 'International' : 'Domestic'}</dd>
              </div>
              <div>
                <dt className="kicker mb-1">Billing</dt>
                <dd className="flex items-center gap-1.5 text-[13px]"><Briefcase className="h-3.5 w-3.5 text-muted" />{t.costCenter?.code} · {t.costCenter?.name}{t.projectCode && ` · ${t.projectCode}`}</dd>
              </div>
            </dl>
            <div className="mt-6 overflow-hidden rounded-2xl border border-line">
              {costs.map(([label, v]) => (
                <div key={label} className="flex items-center justify-between border-b border-line/70 px-4 py-2.5 text-[13px]">
                  <span className="text-muted">{label}</span>
                  <span className="num">{money(v, t.currency)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-subtle/60 px-4 py-3">
                <span className="text-[13px] font-semibold">Estimated total</span>
                <span className="text-right">
                  <span className="num block text-[15px] font-semibold">{money(sum, t.currency)}</span>
                  {t.currency !== 'INR' && <span className="num block text-[11.5px] text-muted">≈ {money(t.estTotalBase)}</span>}
                </span>
              </div>
            </div>
            {t.notes && <p className="mt-4 rounded-xl bg-subtle px-3 py-2.5 text-[13px] text-ink/85">{t.notes}</p>}
          </motion.section>

          <section className="card p-5 md:p-6">
            <h2 className="mb-3 text-[15px] font-semibold">Policy</h2>
            <PolicyFlags flags={t.policyFlags} />
            {t.exceptionReason && (
              <div className="mt-3 rounded-xl border border-line p-3 text-[13px]">
                <p className="kicker mb-1">Exception justification</p>
                <p>{t.exceptionReason}</p>
              </div>
            )}
          </section>

          <section className="card p-5 md:p-6">
            <h2 className="mb-3 text-[15px] font-semibold">Documents</h2>
            {!t.attachments.length && !editable && <p className="text-[13px] text-muted">No documents attached.</p>}
            <FileDrop target={{ travelRequestId: id }} files={t.attachments} editable={editable} onChange={refetch} />
          </section>

          {t.expenseReports.length > 0 && (
            <section className="card p-5 md:p-6">
              <h2 className="mb-3 text-[15px] font-semibold">Linked expense reports</h2>
              <ul className="space-y-2">
                {t.expenseReports.map((e) => (
                  <li key={e.id}>
                    <Link to={`/expenses/${e.id}`} className="group flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand/30 hover:bg-subtle/60">
                      <FileText className="h-4 w-4 text-brand" />
                      <span className="flex-1 text-[13px] font-medium">{e.code} · {e.title}</span>
                      <span className="num text-[13px]">{money(e.totalBase)}</span>
                      <StatusChip status={e.status} size="sm" />
                      <ArrowRight className="h-4 w-4 text-muted group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="card self-start p-5 md:p-6 xl:sticky xl:top-24">
          <Tabs
            id="travel-detail"
            className="mb-5"
            value={tab}
            onChange={setTab}
            tabs={[{ value: 'approvals', label: 'Approvals' }, { value: 'activity', label: 'Activity' }, { value: 'versions', label: 'Versions', count: t.revisions.length }]}
          />
          {tab === 'approvals' && <ApprovalTimeline steps={t.steps} currentRound={t.round} />}
          {tab === 'activity' && <ActivityLog items={t.activity} />}
          {tab === 'versions' && (
            <ul className="space-y-2">
              {t.revisions.length === 0 && <p className="text-[13px] text-muted">Versions are saved each time the request is submitted.</p>}
              {t.revisions.map((r) => (
                <li key={r.id} className="rounded-xl border border-line p-3 text-[12.5px]">
                  <p className="font-medium">Version {r.version} · {money(r.snapshot.estTotalBase)}</p>
                  <p className="text-muted">Submitted {dateTime(r.createdAt)} · {r.snapshot.origin} → {r.snapshot.destination}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={confirm === 'submit'}
        onClose={() => setConfirm(null)}
        title={t.status === 'RETURNED' ? 'Resubmit this request?' : 'Submit for approval?'}
        description="Your approvers are notified right away."
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={doSubmit} disabled={submit.isPending || (needsReason && !reason.trim())}>
              {submit.isPending && <Spinner />} Submit
            </button>
          </>
        }
      >
        <PolicyFlags flags={t.policyFlags} compact />
        {needsReason && (
          <div className="mt-4">
            <label className="label" htmlFor="sub-reason">Why is this exception needed?</label>
            <textarea id="sub-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </Modal>
      <Modal
        open={confirm === 'withdraw' || confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? 'Delete this draft?' : 'Withdraw this request?'}
        description={confirm === 'delete' ? 'This cannot be undone.' : 'Pending approvals are cancelled. The history is kept.'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Keep it</button>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                try {
                  if (confirm === 'delete') {
                    await remove.mutateAsync();
                    toast.success('Draft deleted');
                    navigate('/travel');
                  } else {
                    await withdraw.mutateAsync();
                    toast.success('Request withdrawn');
                  }
                  setConfirm(null);
                } catch (err) {
                  toast.error(err.message);
                }
              }}
            >
              {confirm === 'delete' ? 'Delete' : 'Withdraw'}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-muted">{t.code} · {t.title}</p>
      </Modal>
    </div>
  );
}
