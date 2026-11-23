import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api.js';

/** Reference data (categories, currencies, cost centers, policy hints) - cached app-wide. */
export const useReference = () => useQuery({ queryKey: ['reference'], queryFn: () => get('/admin/reference'), staleTime: 5 * 60 * 1000 });

/** Approvals waiting for the current user (shared by layout badge, dashboard and inbox). */
export const useInbox = (enabled = true) =>
  useQuery({ queryKey: ['approvals', 'inbox'], queryFn: () => get('/approvals/inbox'), enabled, refetchInterval: 60_000 });

export const useDirectory =() => useQuery({ queryKey: ['directory'], queryFn: () => get('/users/directory'), staleTime: 5 * 60 * 1000 });

export function useDebounce(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Keyboard shortcuts that never fire while typing in a field. */
export function useHotkeys(map, deps = []) {
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
      const key = `${e.metaKey || e.ctrlKey ? 'mod+' : ''}${e.key.toLowerCase()}`;
      const fn = map[key];
      if (!fn || (typing && !key.startsWith('mod+'))) return;
      if (document.querySelector('[role="dialog"]') && !key.startsWith('mod+')) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
