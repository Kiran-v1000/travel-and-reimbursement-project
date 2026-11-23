import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Search, X, Check } from 'lucide-react';
import { Avatar } from './ui/Avatar.jsx';
import { Spinner } from './ui/primitives.jsx';
import { useDebounce, useUserSearch, useUsersByIds } from '../hooks/index.js';

/**
 * Searchable people picker (combobox). Queries the server as you type, so it works the
 * same with 10 people or 100,000.
 */
export function UserPicker({ value, onChange, placeholder = 'Search by name, email or ID…', role, excludeId, allowClear = true, className, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const listId = useId();
  const debounced = useDebounce(term.trim(), 220);
  const { data: results = [], isFetching } = useUserSearch(debounced, { role, enabled: open });
  const { data: selected = [] } = useUsersByIds(value ? [value] : []);
  const current = selected.find((u) => u.id === value);
  const options = results.filter((u) => u.id !== excludeId);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    setActive(0);
  }, [debounced]);

  const pick = (u) => {
    onChange(u?.id ?? null, u ?? null);
    setOpen(false);
    setTerm('');
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <div className="relative">
        {!open && current ? (
          <button type="button" onClick={() => setOpen(true)} className="input flex items-center gap-2 text-left" aria-label={ariaLabel ? `${ariaLabel}: ${current.name}` : current.name}>
            <Avatar name={current.name} size={22} />
            <span className="min-w-0 flex-1 truncate">{current.name}<span className="text-muted"> · {current.title || current.email}</span></span>
          </button>
        ) : (
          <>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-label={ariaLabel ?? placeholder}
              aria-autocomplete="list"
              className="input pl-9 pr-9"
              placeholder={placeholder}
              value={term}
              autoFocus={open && !!current}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
              onKeyDown={onKey}
            />
          </>
        )}
        {allowClear && value && (
          <button type="button" onClick={() => pick(null)} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink" aria-label="Clear selection">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {isFetching && open && <Spinner className="absolute right-10 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />}
      </div>
      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lift"
          >
            {options.length === 0 && <li className="px-3 py-4 text-center text-[12.5px] text-muted">{isFetching ? 'Searching…' : 'No people match'}</li>}
            {options.map((u, i) => (
              <li key={u.id} role="option" aria-selected={u.id === value}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(u)}
                  className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left', i === active ? 'bg-brand/[0.08]' : 'hover:bg-subtle')}
                >
                  <Avatar name={u.name} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{u.name}</span>
                    <span className="block truncate text-[11.5px] text-muted">{u.title || u.role} · {u.email}</span>
                  </span>
                  {u.id === value && <Check className="h-4 w-4 text-brand" />}
                </button>
              </li>
            ))}
            {options.length >= 20 && <li className="px-3 py-1.5 text-center text-[11px] text-muted">Showing the first 20 matches. Keep typing to narrow down.</li>}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
