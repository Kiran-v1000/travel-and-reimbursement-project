import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { ease } from '../../lib/motion.js';

/** Accessible modal / side drawer with focus trap, Esc to close and focus restore. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', variant = 'center' }) {
  const panel = useRef(null);
  const last = useRef(null);
  // Callers often pass a new onClose function on every render. Keep the latest one in a ref so
  // the setup below runs only when the dialog opens/closes - otherwise every re-render would
  // move focus back to the page and then to the first field again.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    last.current = document.activeElement;
    const t = setTimeout(() => {
      const first = panel.current?.querySelector('[data-autofocus], input, textarea, select, button:not([data-close])');
      (first ?? panel.current)?.focus();
    }, 30);
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.();
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const [a, b] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      last.current?.focus?.();
    };
  }, [open]);

  const drawer = variant === 'drawer';
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={clsx('fixed inset-0 z-50 flex', drawer ? 'justify-end' : 'items-end sm:items-center justify-center p-0 sm:p-4')}>
          <motion.div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={clsx(
              'relative flex w-full flex-col bg-surface shadow-2xl outline-none',
              drawer ? 'h-full max-w-xl border-l border-line' : clsx(widths[size], 'max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-line'),
            )}
            initial={drawer ? { x: 40, opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={drawer ? { x: 0, opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={drawer ? { x: 40, opacity: 0, transition: { duration: 0.16 } } : { opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ duration: 0.26, ease }}
          >
            <div className="flex items-start gap-4 border-b border-line px-6 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
              </div>
              <button data-close type="button" onClick={onClose} className="btn-ghost h-8 w-8 px-0" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle/40 px-6 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
