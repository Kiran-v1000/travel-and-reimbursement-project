import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../app/store.js';
import { renderArticle } from '../lib/help.js';
import { useHelpValues } from '../hooks/useHelp.js';

/**
 * An article's text. Links to other articles and app pages stay inside the app: inside the side
 * panel, help links swap the article in place; app links navigate and close the panel.
 */
export function ArticleBody({ article, inPanel = false }) {
  const values = useHelpValues();
  const html = useMemo(() => renderArticle(article, values), [article, values]);
  const navigate = useNavigate();
  const openHelp = useAppStore((s) => s.openHelp);
  const closeHelp = useAppStore((s) => s.closeHelp);

  const onClick = (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('/') || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (inPanel && href.startsWith('/help/')) {
      openHelp(href.slice('/help/'.length));
      return;
    }
    if (inPanel) closeHelp();
    navigate(href);
  };

  // Content is bundled with the app (Markdown in features/help/content); live values are escaped.
  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegated handler for the links inside; links stay keyboard-operable
  return <div className="help-prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
