import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BY_SLUG } from '../lib/help.js';
import { ArticleView } from '../components/ArticleView.jsx';

export function HelpArticlePage() {
  const { slug } = useParams();
  const article = BY_SLUG[slug];
  if (!article) return <Navigate to="/help" replace />;
  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-[12.5px] text-muted">
        <Link to="/help" className="inline-flex min-h-6 items-center gap-1 hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden /> Help Center</Link>
        <span aria-hidden>/</span>
        <span>{article.section}</span>
      </nav>
      <ArticleView article={article} />
    </div>
  );
}
