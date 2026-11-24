import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal-dialog keyboard behaviour for a custom overlay (e.g. the mobile menu drawer):
 * focus moves into the panel when it opens, Tab stays inside it, Escape closes it, and focus
 * returns to whatever opened it. `onClose` may change on every render.
 */
export function useDialogFocus(open, onClose) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const t = setTimeout(() => panel.current?.querySelector(FOCUSABLE)?.focus(), 30);
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.();
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const [first, last] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      // Return focus to the opener, unless the user navigated somewhere and focus moved on.
      if (opener?.isConnected && (document.activeElement === document.body || panel.current?.contains(document.activeElement))) opener.focus?.();
    };
  }, [open]);

  return panel;
}
