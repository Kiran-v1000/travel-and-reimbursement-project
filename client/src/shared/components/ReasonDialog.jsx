import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal.jsx';
import { Field, Spinner } from './ui/primitives.jsx';

/** Ask for a decision comment. Reason is required for reject / return. */
export function ReasonDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'primary', required = true, placeholder, busy, children }) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setText('');
      setTouched(false);
    }
  }, [open]);
  const invalid = required && !text.trim();
  const submit = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!invalid) onConfirm(text.trim());
  };
  const btn = { primary: 'btn-primary', danger: 'btn-danger', success: 'btn-success', warn: 'btn bg-warn text-white hover:opacity-90 dark:text-slate-950' }[tone];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="reason-form" className={btn} disabled={busy}>
            {busy && <Spinner />} {confirmLabel}
          </button>
        </>
      }
    >
      <form id="reason-form" onSubmit={submit} className="space-y-4">
        {children}
        <Field label={required ? 'Reason' : 'Comment (optional)'} required={required} error={touched && invalid ? 'Please add a short reason so the requester knows what to do next' : null}>
          <textarea
            data-autofocus
            rows={4}
            className="input"
            value={text}
            placeholder={placeholder ?? (required ? 'Explain what needs to change…' : 'Add a note for the requester…')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit(e)}
            maxLength={1000}
          />
        </Field>
      </form>
    </Modal>
  );
}
