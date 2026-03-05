import { useMemo } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Clock, Globe } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import SEO from '@/components/SEO';
import { fromArticleSlug } from '@/lib/articleSlug';
import type { Article } from '@/types/article';

export default function Article() {
  const { slug } = useParams<{ slug: string }>();
  const { state } = useLocation();
  const navigate = useNavigate();

  const article = state?.article as Article | undefined;

  const sourceUrl = useMemo(() => {
    if (!slug) return null;
    try { return fromArticleSlug(slug); } catch { return null; }
  }, [slug]);

  const newsArticleSchema = article ? {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.summary_points?.[0] ?? article.description,
    url: article.url,
    datePublished: article.publishedAt,
    image: article.image_url || undefined,
    publisher: { '@type': 'Organization', name: article.source },
  } : null;

  // ── Fallback: no article data in router state (direct URL access) ──────────
  if (!article) {
    return (
      <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
        <SEO
          title="Article"
          description="Short-form news summary on Shortform."
          canonical={`/article/${slug ?? ''}`}
        />
        <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-stone-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
              <Globe className="w-8 h-8 text-stone-400 dark:text-slate-500" />
            </div>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
              This article may have expired
            </h1>
            <p className="text-sm text-stone-500 dark:text-slate-400">
              News articles refresh hourly. This link may no longer be in the current feed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
                >
                  View original source
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-stone-200 dark:border-slate-600 text-stone-700 dark:text-slate-300 text-sm font-medium hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
              >
                Browse latest news
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main article view ──────────────────────────────────────────────────────
  const description = article.summary_points?.[0] ?? article.description ?? '';

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      <SEO
        title={article.title}
        description={description}
        canonical={`/article/${slug}`}
        ogImage={article.image_url ?? undefined}
        ogType="article"
        publishedTime={article.publishedAt}
        section={article.category}
      />
      {newsArticleSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleSchema) }}
        />
      )}

      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {article.category && (
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {article.category}
              </Badge>
            )}
            <span className="text-xs text-stone-400 dark:text-slate-500 truncate">
              {article.source}
            </span>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8 space-y-6">

          {/* Hero image */}
          {article.image_url && (
            <div className="rounded-2xl overflow-hidden aspect-[16/9] bg-stone-100 dark:bg-slate-700">
              <img
                src={article.image_url}
                alt={article.title}
                className="w-full h-full object-cover"
                fetchPriority="high"
              />
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 dark:text-stone-100 leading-snug">
            {article.title}
          </h1>

          {/* Meta row */}
          <div className="flex items-center gap-3 text-sm text-stone-500 dark:text-slate-400 flex-wrap">
            <span className="font-medium text-stone-700 dark:text-slate-300">
              {article.source}
            </span>
            {article.time_ago && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {article.time_ago}
                </span>
              </>
            )}
          </div>

          {/* AI Summary */}
          {article.summary_points && article.summary_points.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs">✨</span>
                </div>
                <span className="text-xs font-semibold text-stone-500 dark:text-slate-400 uppercase tracking-wider">
                  AI Summary
                </span>
              </div>
              <ul className="space-y-3">
                {article.summary_points.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-stone-700 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-900 dark:bg-slate-400 mt-2 flex-shrink-0" />
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Read full article CTA */}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
          >
            Read full article on {article.source}
            <ExternalLink className="w-4 h-4" />
          </a>

        </div>
      </ScrollArea>
    </div>
  );
}
