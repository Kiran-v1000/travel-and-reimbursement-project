import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, Plane, Receipt, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../../app/store.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';

const STEPS = [
  { icon: Sparkles, title: 'Welcome to Voyage', body: 'This is where you ask to travel for work and get your money back for what you spent. It takes a minute to learn.' },
  { icon: Plane, title: 'Going somewhere? Request travel first', body: 'Select Request travel, say where, when and why. Your manager approves it, and you get a notification. Book once it says Approved.' },
  { icon: Receipt, title: 'Spent money for work? Claim it', body: 'Select New expense, add one line per bill with a photo of the receipt, and submit. After approval, Finance pays you and tells you when.' },
  { icon: HelpCircle, title: 'Help is always one click away', body: 'Select ? at the top, or "How does this work?" on any form. The Help Center has a map of the whole journey and short how-tos.' },
];

const seenKey = (userId) => `voyage.tour.seen.${userId}`;

/**
 * A short welcome tour: shown once, the first time someone signs in (remembered per person in
 * this browser), and again whenever they choose "Take the tour" in the Help Center.
 */
export function WelcomeTour() {
  const user = useAppStore((s) => s.user);
  const open = useAppStore((s) => s.tourOpen);
  const setTour = useAppStore((s) => s.setTour);
  const navigate = useNavigate();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!user) return;
    try {
      if (!localStorage.getItem(seenKey(user.id))) setTour(true);
    } catch {
      /* storage unavailable: skip the automatic tour */
    }
  }, [user, setTour]);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const close = () => {
    try {
      if (user) localStorage.setItem(seenKey(user.id), '1');
    } catch {
      /* ignore */
    }
    setTour(false);
  };

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const Icon = step.icon;

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={`Quick tour · ${i + 1} of ${STEPS.length}`}
      footer={
        <>
          <button type="button" className="btn-ghost mr-auto" onClick={close}>Skip</button>
          {i > 0 && <button type="button" className="btn-secondary" onClick={() => setI(i - 1)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</button>}
          {last ? (
            <button type="button" className="btn-primary" onClick={() => { close(); navigate('/help/how-voyage-works'); }}>See the journey map <ArrowRight className="h-4 w-4" aria-hidden /></button>
          ) : (
            <button type="button" className="btn-primary" data-autofocus onClick={() => setI(i + 1)}>Next <ArrowRight className="h-4 w-4" aria-hidden /></button>
          )}
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} aria-live="polite">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon className="h-6 w-6" aria-hidden /></span>
          <h3 className="text-[17px] font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{step.body}</p>
        </motion.div>
      </AnimatePresence>
      <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
        {STEPS.map((s, n) => <span key={s.title} className={clsx('h-1.5 rounded-full transition-all', n === i ? 'w-6 bg-brand' : 'w-1.5 bg-line')} />)}
      </div>
    </Modal>
  );
}
