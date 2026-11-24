import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAppStore } from '../../../app/store.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { BY_SLUG } from '../lib/help.js';
import { ArticleView } from './ArticleView.jsx';

/** Help opened next to the page you are on (drawer), so you never lose your place. */
export function HelpPanel() {
  const slug = useAppStore((s) => s.helpSlug);
  const closeHelp = useAppStore((s) => s.closeHelp);
  const article = slug ? BY_SLUG[slug] : null;
  return (
    <Modal
      open={!!article}
      onClose={closeHelp}
      variant="drawer"
      title={article?.title ?? 'Help'}
      description={article?.summary}
      footer={article && (
        <Link to={`/help/${article.slug}`} onClick={closeHelp} className="btn-ghost h-9 text-[12.5px]">
          <ExternalLink className="h-4 w-4" aria-hidden /> Open in Help Center
        </Link>
      )}
    >
      {article && <ArticleView key={article.slug} article={article} inPanel />}
    </Modal>
  );
}
