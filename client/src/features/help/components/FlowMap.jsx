import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Plane, ShieldCheck, UserCheck, Ticket, Receipt, Landmark, CalendarClock, Wallet, BookOpenCheck, Undo2, XCircle, ArrowDown,
} from 'lucide-react';
import { useAppStore } from '../../../app/store.js';

/** Who does a step. Colour is never the only signal: every step also names the role in text. */
const ROLES = {
  you: { label: 'You', chip: 'bg-brand/10 text-brand-ink ring-brand/25', dot: 'bg-brand' },
  approver: { label: 'Your approvers', chip: 'bg-info/10 text-info ring-info/25', dot: 'bg-info' },
  finance: { label: 'Finance', chip: 'bg-ok/10 text-ok ring-ok/25', dot: 'bg-ok' },
  auto: { label: 'Voyage (automatic)', chip: 'bg-subtle text-muted ring-line', dot: 'bg-muted' },
};

const PHASES = [
  {
    title: 'Before the trip',
    note: 'Only for business travel',
    steps: [
      { n: 1, icon: Plane, role: 'you', title: 'Request the trip', text: 'Where, when, why and rough costs.', slug: 'request-trip' },
      { n: 2, icon: ShieldCheck, role: 'auto', title: 'Rules checked as you type', text: 'Anything outside policy needs a reason.', slug: 'trip-policy' },
      { n: 3, icon: UserCheck, role: 'approver', title: 'Approved', text: 'Your manager, plus others for bigger trips.', slug: 'track-request' },
      { n: 4, icon: Ticket, role: 'you', title: 'Travel', text: 'Book only once it says Approved. Keep every bill.', slug: 'request-trip' },
    ],
  },
  {
    title: 'After the trip (or any work expense)',
    note: 'Getting your money back',
    steps: [
      { n: 5, icon: Receipt, role: 'you', title: 'Claim your expenses', text: 'One line per bill, with a photo of the receipt.', slug: 'claim-expense' },
      { n: 6, icon: ShieldCheck, role: 'auto', title: 'Rules checked', text: 'Missing receipts or limits are flagged.', slug: 'policy-badges' },
      { n: 7, icon: UserCheck, role: 'approver', title: 'Approved', text: 'Same approvers as for trips.', slug: 'approve-requests' },
      { n: 8, icon: Landmark, role: 'finance', title: 'Finance review', text: 'Bills and coding checked.', slug: 'finance-review' },
      { n: 9, icon: CalendarClock, role: 'finance', title: 'Payment scheduled', text: 'You are told the date and method.', slug: 'get-paid' },
      { n: 10, icon: Wallet, role: 'finance', title: 'Paid', text: 'Money sent, with a bank reference (UTR).', slug: 'get-paid' },
      { n: 11, icon: BookOpenCheck, role: 'finance', title: 'Booked in accounts', text: 'Exported to the accounting system once.', slug: 'accounting-export' },
    ],
  },
];

function Step({ step, last, compact }) {
  const openHelp = useAppStore((s) => s.openHelp);
  const role = ROLES[step.role];
  const Icon = step.icon;
  const inner = (
    <>
      <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white dark:text-slate-950', role.dot)} aria-hidden>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-semibold"><span className="sr-only">Step </span>{step.n}. {step.title}</span>
          <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', role.chip)}>{role.label}</span>
        </span>
        {!compact && <span className="mt-0.5 block text-[12.5px] text-muted">{step.text}</span>}
      </span>
    </>
  );
  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => openHelp(step.slug)}
        className="card flex w-full items-start gap-3 p-3 text-left transition-[border-color,transform] hover:-translate-y-px hover:border-brand/40"
        aria-label={`Step ${step.n}: ${step.title}. Done by ${role.label}. Open how-to.`}
      >
        {inner}
      </button>
      {!last && (
        <span className="flex justify-center py-1 text-muted" aria-hidden>
          <ArrowDown className="h-4 w-4" />
        </span>
      )}
    </li>
  );
}

/** The whole journey on one page: who does what, in order, with the side paths. */
export function FlowMap({ compact = false }) {
  return (
    <figure className="rounded-2xl border border-line bg-subtle/40 p-4 sm:p-5" aria-labelledby="flowmap-caption">
      <figcaption id="flowmap-caption" className="mb-4">
        <span className="block text-[15px] font-semibold">The journey at a glance</span>
        <span className="mt-2 flex flex-wrap gap-2" aria-label="Who does each step">
          {Object.values(ROLES).map((r) => (
            <span key={r.label} className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset', r.chip)}>
              <span className={clsx('h-2 w-2 rounded-full', r.dot)} aria-hidden /> {r.label}
            </span>
          ))}
        </span>
      </figcaption>

      <div className={clsx('grid gap-5', !compact && 'lg:grid-cols-2')}>
        {PHASES.map((phase) => (
          <section key={phase.title} aria-label={phase.title} className="min-w-0">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{phase.title}</h3>
            <p className="mb-3 text-[12px] text-muted">{phase.note}</p>
            <ol>
              {phase.steps.map((s, i) => <Step key={s.n} step={s} last={i === phase.steps.length - 1} compact={compact} />)}
            </ol>
          </section>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/[0.07] p-3 text-[12.5px]">
          <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p><span className="font-semibold">Returned?</span> At step 3, 7 or 8 someone may ask for a change. Fix it and send it again; earlier comments stay in the history. <Link to="/help/returned-request" className="font-medium text-brand hover:underline">How</Link></p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-bad/25 bg-bad/[0.06] p-3 text-[12.5px]">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
          <p><span className="font-semibold">Rejected?</span> The request stops, with the reason. You can talk to the approver and start a new one. <Link to="/help/track-request" className="font-medium text-brand hover:underline">Statuses</Link></p>
        </div>
      </div>
    </figure>
  );
}
