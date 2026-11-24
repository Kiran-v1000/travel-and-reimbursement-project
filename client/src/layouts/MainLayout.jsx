import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { PageErrorBoundary } from '../shared/components/PageErrorBoundary.jsx';
import { useDialogFocus } from '../shared/hooks/useDialogFocus.js';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Plane, Receipt, Search, Plus, Moon, Sun, Menu, X, LogOut, UserCircle2, ChevronDown, UserCheck } from 'lucide-react';
import { NAV } from './nav.js';
import { useAppStore, hasRole } from '../app/store.js';
import { useLogout } from '../features/auth/index.js';
import { NotificationBell } from '../features/notifications/index.js';
import { useInbox, useHotkeys } from '../shared/hooks/index.js';
import { Avatar } from '../shared/components/ui/Avatar.jsx';
import { page, pop } from '../shared/lib/motion.js';
import { ROLE_LABEL } from '../shared/utils/status.js';
import { Logo } from './Logo.jsx';
import { CommandPalette } from './CommandPalette.jsx';


function Sidebar({ onNavigate }) {
  const user = useAppStore((s) => s.user);
  const { data: inbox } = useInbox(!!user);
  const items = NAV.filter((n) => !n.roles || hasRole(user, ...n.roles));
  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="px-5 pb-6 pt-5">
        <Link to="/" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <ul className="flex-1 space-y-0.5 px-3">
        {items.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                clsx('group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors duration-150', isActive ? 'text-ink' : 'text-muted hover:bg-subtle hover:text-ink')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-surface shadow-card ring-1 ring-line" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
                  {isActive && <motion.span layoutId="nav-bar" className="absolute -left-3 top-2 h-6 w-1 rounded-r-full bg-brand" />}
                  <n.icon className={clsx('relative h-[18px] w-[18px] transition-colors', isActive ? 'text-brand' : 'text-muted group-hover:text-ink')} />
                  <span className="relative flex-1">{n.label}</span>
                  {n.badge === 'approvals' && inbox?.length > 0 && (
                    <span className="num relative rounded-full bg-brand px-1.5 py-0.5 text-[10.5px] font-bold text-white dark:text-slate-950">{inbox.length}</span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="m-3 rounded-2xl border border-line bg-gradient-to-br from-brand-soft to-surface p-4">
        <p className="text-[12.5px] font-semibold">Need to travel?</p>
        <p className="mt-0.5 text-[12px] text-muted">Most trips are approved within a day.</p>
        <Link to="/travel/new" onClick={onNavigate} className="btn-primary mt-3 h-8 w-full text-[12.5px]">
          <Plus className="h-3.5 w-3.5" /> Request travel
        </Link>
      </div>
    </nav>
  );
}

function NewMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const go = (to) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-primary h-9" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Plus className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">New</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...pop} className="fixed inset-x-3 top-[4.25rem] z-40 origin-top rounded-2xl border border-line bg-surface p-1.5 shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-64 sm:origin-top-right">
            {[
              { to: '/travel/new', icon: Plane, title: 'Travel request', body: 'Plan a trip and get it approved' },
              { to: '/expenses/new', icon: Receipt, title: 'Expense report', body: 'Claim money you spent' },
            ].map((o) => (
              <button key={o.to} type="button" onClick={() => go(o.to)} className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-subtle">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <o.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-medium">{o.title}</span>
                  <span className="block text-[12px] text-muted">{o.body}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const user = useAppStore((s) => s.user);
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-subtle" aria-expanded={open} aria-label="Account menu">
        <Avatar name={user?.name} size={30} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[12.5px] font-semibold">{user?.name}</span>
          <span className="block text-[11px] text-muted">{ROLE_LABEL[user?.role]}</span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-muted md:block" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...pop} className="fixed right-3 top-[4.25rem] z-40 w-64 max-w-[calc(100vw-24px)] origin-top-right rounded-2xl border border-line bg-surface p-1.5 shadow-lift sm:absolute sm:right-0 sm:top-auto sm:mt-2">
            <div className="px-3 py-2.5">
              <p className="text-[13px] font-semibold">{user?.name}</p>
              <p className="truncate text-[12px] text-muted">{user?.email}</p>
              <p className="mt-1 text-[11.5px] text-muted">
                {user?.title} · {user?.department?.name}
              </p>
            </div>
            <div className="my-1 h-px bg-line" />
            <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] hover:bg-subtle">
              <UserCircle2 className="h-4 w-4 text-muted" /> Profile &amp; delegation
            </Link>
            <button type="button" onClick={logout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-bad hover:bg-bad/5">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MainLayout({ fallback }) {
  const { sidebarOpen, setSidebar, theme, toggleTheme, setPalette, delegatedFrom } = useAppStore();
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const drawer = useDialogFocus(sidebarOpen, () => setSidebar(false));

  useEffect(() => {
    setSidebar(false);
  }, [location.pathname, setSidebar]);

  // After each page change: name the browser tab after the page (WCAG 2.4.2) and, on in-app
  // navigation, move focus to the page heading so screen readers announce the new page.
  // Detail pages render their heading after data loads, so wait for it (up to 3 s).
  const firstPage = useRef(true);
  useEffect(() => {
    let tries = 0;
    let timer;
    // The previous page stays on screen while it animates out: wait for a heading that was not
    // there when the navigation started.
    const previous = document.querySelector('main h1');
    const settle = () => {
      const found = document.querySelector('main h1');
      const h1 = found && found !== previous && found.isConnected ? found : null;
      if (!h1 && tries++ < 12) { timer = setTimeout(settle, 250); return; }
      // Gave up waiting for a new heading: name the tab after whatever heading is there.
      const titled = h1 ?? found;
      const name = titled?.dataset.pageTitle || titled?.textContent?.trim();
      document.title = name ? `${name} · Voyage` : 'Voyage · Travel & Reimbursement';
      if (firstPage.current) { firstPage.current = false; return; }
      // Leave focus alone if the page already moved it (e.g. a form focusing its first field).
      if (h1 && (document.activeElement === document.body || document.activeElement?.closest('nav, aside, header'))) {
        h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
      }
    };
    timer = setTimeout(settle, 300);
    return () => clearTimeout(timer);
  }, [location.pathname]);
  useHotkeys({ 'mod+k': () => setPalette(true), '/': () => setPalette(true), n: () => navigate('/expenses/new'), t: () => navigate('/travel/new') }, [navigate]);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>

      <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-bg/80 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-slate-950/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebar(false)} />
            <motion.div
              ref={drawer}
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              className="absolute inset-y-0 left-0 w-[272px] border-r border-line bg-bg shadow-2xl"
            >
              <button type="button" onClick={() => setSidebar(false)} className="btn-ghost absolute right-3 top-4 h-8 w-8 px-0" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
              <Sidebar onNavigate={() => setSidebar(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <button type="button" className="btn-ghost h-9 w-9 px-0 lg:hidden" onClick={() => setSidebar(true)} aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="mobile-menu">
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-[13px] text-muted transition-colors hover:border-brand/40 md:max-w-md"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Search trips, expenses, pages…</span>
              <kbd className="ml-auto hidden rounded-md border border-line bg-subtle px-1.5 py-0.5 font-sans text-[10.5px] font-medium sm:inline">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
              <NewMenu />
              <button type="button" className="btn-ghost h-9 w-9 px-0" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                    {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                  </motion.span>
                </AnimatePresence>
              </button>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>

        {delegatedFrom?.length > 0 && (
          <div className="border-b border-brand/20 bg-brand/[0.06]">
            <div className="mx-auto flex max-w-[1320px] items-center gap-2 px-4 py-2 text-[12.5px] sm:px-6 lg:px-8">
              <UserCheck className="h-4 w-4 text-brand" />
              <span>
                You are covering approvals for <strong>{delegatedFrom.map((d) => d.delegator.name).join(', ')}</strong>.
              </span>
              <Link to="/approvals" className="ml-auto font-medium text-brand hover:underline">
                Open inbox
              </Link>
            </div>
          </div>
        )}

        <main id="main" tabIndex={-1} className="outline-none mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} {...page}>
              <PageErrorBoundary resetKey={location.pathname}>
                <Suspense fallback={fallback}>{outlet}</Suspense>
              </PageErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
