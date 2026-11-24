import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Search, CornerDownLeft, Plane, Receipt, Plus, ArrowRight } from 'lucide-react';
import { useAppStore, hasRole } from '../app/store.js';
import { get } from '../shared/lib/api.js';
import { useDebounce } from '../shared/hooks/index.js';
import { StatusChip } from '../shared/components/ui/StatusChip.jsx';
import { NAV } from './nav.js';

/** Ctrl/Cmd+K palette: jump to pages, start actions, and search records. */
export function CommandPalette() {
  const { paletteOpen: open, setPalette, user } = useAppStore();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const navigate = useNavigate();
  const term = useDebounce(q.trim(), 200);
  const scope = hasRole(user, 'ADMIN', 'AUDITOR', 'FINANCE', 'MANAGER') ? 'all' : 'mine';

  const { data: results } = useQuery({
    queryKey: ['palette', term, scope],
    enabled: open && term.length >= 2,
    queryFn: async () => {
      const [t, e] = await Promise.all([get('/travel', { search: term, scope, pageSize: 5 }), get('/expenses', { search: term, scope, pageSize: 5 })]);
      return [
        ...t.items.map((x) => ({ kind: 'record', icon: Plane, label: `${x.code} · ${x.title}`, hint: x.destination, status: x.status, to: `/travel/${x.id}` })),
        ...e.items.map((x) => ({ kind: 'record', icon: Receipt, label: `${x.code} · ${x.title}`, hint: x.employee?.name, status: x.status, to: `/expenses/${x.id}` })),
      ];
    },
  });

  const items = useMemo(() => {
    const s = q.toLowerCase();
    const pages = NAV.filter((n) => !n.roles || hasRole(user, ...n.roles))
      .filter((n) => !s || n.label.toLowerCase().includes(s))
      .map((n) => ({ kind: 'page', icon: n.icon, label: n.label, hint: 'Go to page', to: n.to }));
    const actions = [
      { kind: 'action', icon: Plus, label: 'New travel request', hint: 'T', to: '/travel/new' },
      { kind: 'action', icon: Plus, label: 'New expense report', hint: 'N', to: '/expenses/new' },
    ].filter((a) => !s || a.label.toLowerCase().includes(s));
    return [...actions, ...pages, ...(term.length >= 2 ? results ?? [] : [])];
  }, [q, user, results, term]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);
  useEffect(() => {
    setActive(0);
  }, [q]);
  // Keep the highlighted result visible while moving through a long list with the arrow keys.
  useEffect(() => {
    if (open) document.getElementById(`palette-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const go = (item) => {
    setPalette(false);
    navigate(item.to);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && items[active]) go(items[active]);
    if (e.key === 'Escape') setPalette(false);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPalette(false)} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-muted" />
              {/* ARIA combobox: focus stays in the input; the highlighted result is announced via
                  aria-activedescendant, so the options themselves hold no focusable controls. */}
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search or jump to…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
                aria-label="Search or jump to"
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls="palette-results"
                aria-autocomplete="list"
                aria-activedescendant={items[active] ? `palette-opt-${active}` : undefined}
              />
              <kbd className="rounded-md border border-line bg-subtle px-1.5 py-0.5 text-[10.5px] text-muted">Esc</kbd>
            </div>
            {items.length === 0 && <p role="status" className="px-3 py-8 text-center text-[13px] text-muted">No matches for “{q}”.</p>}
            <ul id="palette-results" className="max-h-[50vh] overflow-y-auto p-2 empty:hidden" role="listbox" aria-label="Results">
              {items.map((it, i) => (
                // Keyboard users drive the options from the combobox input (arrows + Enter, via
                // aria-activedescendant); the click handler is for mouse/touch only.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <li
                  key={`${it.kind}-${it.to}-${i}`}
                  id={`palette-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                  className={clsx('flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', i === active ? 'bg-brand/[0.08]' : 'hover:bg-subtle')}
                >
                    <span aria-hidden className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', i === active ? 'bg-brand text-white dark:text-slate-950' : 'bg-subtle text-muted')}>
                      <it.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{it.label}</span>
                      {it.hint && <span className="block truncate text-[11.5px] text-muted">{it.hint}</span>}
                    </span>
                    {it.status && <StatusChip status={it.status} size="sm" />}
                    {i === active && (it.kind === 'record' ? <ArrowRight className="h-4 w-4 text-brand" aria-hidden /> : <CornerDownLeft className="h-4 w-4 text-brand" aria-hidden />)}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4 border-t border-line bg-subtle/50 px-4 py-2 text-[11px] text-muted">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span className="ml-auto">Shortcuts: T new trip · N new expense</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
