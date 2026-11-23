import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Undo2, X, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../app/store.js';
import { post } from '../lib/api.js';
import { ReasonDialog } from './ReasonDialog.jsx';

/**
 * Approve / return / reject controls shown on a record when the signed-in
 * user (or their delegate) holds the pending step.
 */
export function DecisionBar({ steps = [], round, requesterId, onDone }) {
  const { user, delegatedFrom } = useAppStore();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const delegators = delegatedFrom.map((d) => d.delegator.id);
  const step = steps.find((s) => s.status === 'PENDING' && s.round === round && (s.approverId === user.id || delegators.includes(s.approverId)));
  if (!step || requesterId === user.id) return null;

  async function act(action, comment) {
    setBusy(true);
    try {
      await post(`/approvals/${step.id}/act`, { action, comment });
      toast.success({ APPROVED: 'Approved', RETURNED: 'Returned to requester', REJECTED: 'Rejected' }[action]);
      setDialog(null);
      ['approvals', 'travel', 'expenses', 'dashboard', 'notifications', 'finance'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onDone?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mb-6 flex flex-col gap-3 border-brand/30 bg-gradient-to-r from-brand/[0.06] to-transparent p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-[13.5px] font-semibold">Your decision is needed · {step.label}</p>
          {step.approverId !== user.id ? (
            <p className="flex items-center gap-1 text-[12.5px] text-brand-ink">
              <UserCheck className="h-3.5 w-3.5" /> Acting on behalf of {step.approver?.name}
            </p>
          ) : (
            <p className="text-[12.5px] text-muted">Review the details below, then decide.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setDialog('RETURNED')}>
            <Undo2 className="h-4 w-4" /> Return
          </button>
          <button type="button" className="btn-secondary text-bad hover:border-bad/40" onClick={() => setDialog('REJECTED')}>
            <X className="h-4 w-4" /> Reject
          </button>
          <button type="button" className="btn-success" onClick={() => setDialog('APPROVED')}>
            <Check className="h-4 w-4" /> Approve
          </button>
        </div>
      </motion.div>
      <ReasonDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        busy={busy}
        required={dialog !== 'APPROVED'}
        title={{ APPROVED: 'Approve this item?', RETURNED: 'Return for changes', REJECTED: 'Reject this item' }[dialog] ?? ''}
        description={dialog === 'APPROVED' ? 'It moves to the next approver, or completes if you are the last one.' : 'The requester is notified with your reason.'}
        confirmLabel={{ APPROVED: 'Approve', RETURNED: 'Return', REJECTED: 'Reject' }[dialog]}
        tone={{ APPROVED: 'success', RETURNED: 'warn', REJECTED: 'danger' }[dialog]}
        onConfirm={(c) => act(dialog, c)}
      />
    </>
  );
}
