import { useLocation } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../../app/store.js';
import { articlesForScreen } from '../lib/help.js';

/**
 * "How does this work?" - opens the help article for the current page in the side panel.
 * Pass `slug` to choose an article; otherwise the first article that lists this page is used.
 */
export function HelpLink({ slug, label = 'How does this work?', className }) {
  const { pathname } = useLocation();
  const openHelp = useAppStore((s) => s.openHelp);
  const target = slug ?? articlesForScreen(pathname)[0]?.slug;
  if (!target) return null;
  return (
    <button type="button" onClick={() => openHelp(target)} className={clsx('inline-flex min-h-6 items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline', className)}>
      <HelpCircle className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
