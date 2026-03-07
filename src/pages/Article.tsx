import React, { useContext, useMemo, useState } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Clock, Globe, Bookmark, BookmarkCheck, Share2, ThumbsUp, ThumbsDown, Twitter, Facebook, Linkedin, Link2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SEO from '@/components/SEO';
import { fromArticleSlug } from '@/lib/articleSlug';
import type { Article } from '@/types/article';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { ApiReadyContext } from '@/App';
import api from '@/api';

const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const apiReady = useContext(ApiReadyContext);

  const article = state?.article as Article | undefined;

  const [isSaved, setIsSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);
  const [isReacting, setIsReacting] = useState(false);

  const sourceUrl = useMemo(() => {
    if (!slug) return null;
    try { return fromArticleSlug(slug); } catch { return null; }
  }, [slug]);

  const getSafeUrl = () => {
    const url = article?.url ?? sourceUrl;
    if (!url) return null;
    try {
      const p = new URL(url);
      if (p.protocol !== 'https:' && p.protocol !== 'http:') return null;
      return url;
    } catch { return null; }
  };

  const handleSave = async () => {
    if (!isSignedIn) { toast.error('Sign in to save articles'); navigate('/sign-in'); return; }
    if (!article) return;
    setIsSaving(true);
    try {
      if (isSaved && savedId) {
        await api.unsaveArticle(savedId);
        toast.success('Article unsaved');
        setIsSaved(false);
        setSavedId(null);
      } else {
        const result = await api.saveArticle({ ...article, saved_date: new Date().toISOString() });
        toast.success('Article saved!');
        setIsSaved(true);
        if (result && (result as Record<string, unknown>).id) {
          setSavedId((result as Record<string, unknown>).id as string);
        }
      }
    } catch {
      toast.error('Failed to save article');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReaction = async (r: 'up' | 'down') => {
    if (!isSignedIn) { toast.error('Sign in to rate articles'); navigate('/sign-in'); return; }
    if (!article || isReacting) return;
    setIsReacting(true);
    try {
      if (reaction === r) {
        await api.removeReaction(article.url);
        setReaction(null);
      } else {
        await api.setReaction(article, r);
        setReaction(r);
        if (r === 'up') toast.success('Marked as relevant — your feed will improve');
      }
    } catch {
      toast.error('Failed to save reaction');
    } finally {
      setIsReacting(false);
    }
  };

  const handleShare = async (platform?: string) => {
    const safeUrl = getSafeUrl();
    if (!safeUrl) { toast.error('Cannot share: invalid article URL'); return; }

    if (!platform && canNativeShare && article) {
      try {
        await navigator.share({ title: article.title, text: article.summary_points?.[0] ?? article.title, url: safeUrl });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    const url = encodeURIComponent(safeUrl);
    const text = encodeURIComponent(article?.title ?? '');
    const shareUrls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
    if (platform === 'copy') {
      navigator.clipboard.writeText(safeUrl);
      toast.success('Link copied to clipboard!');
    } else if (platform && platform in shareUrls) {
      window.open(shareUrls[platform], '_blank', 'width=600,height=400,noopener,noreferrer');
    }
  };

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
  const safeUrl = getSafeUrl();

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

      {/* Article content */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8 space-y-6 pb-24">

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
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
            >
              Read full article on {article.source}
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

        </div>
      </ScrollArea>

      {/* ── Sticky action toolbar ─────────────────────────────────────── */}
      <div
        className="flex-shrink-0 bg-white dark:bg-slate-800 border-t border-stone-200 dark:border-slate-700 px-4 py-3 flex items-center gap-2"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        {/* Reaction: Thumbs Up */}
        <button
          onClick={() => handleReaction('up')}
          disabled={isReacting}
          title="Relevant — show me more like this"
          className={`flex items-center justify-center gap-2 flex-1 min-h-[44px] rounded-xl text-sm font-medium border transition-all ${
            reaction === 'up'
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
              : 'border-stone-200 dark:border-slate-700 text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 active:bg-stone-200 dark:active:bg-slate-600'
          }`}
        >
          <ThumbsUp className="w-4 h-4" />
          <span>Relevant</span>
        </button>

        {/* Reaction: Thumbs Down */}
        <button
          onClick={() => handleReaction('down')}
          disabled={isReacting}
          title="Not relevant — show me less like this"
          className={`flex items-center justify-center gap-2 flex-1 min-h-[44px] rounded-xl text-sm font-medium border transition-all ${
            reaction === 'down'
              ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
              : 'border-stone-200 dark:border-slate-700 text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 active:bg-stone-200 dark:active:bg-slate-600'
          }`}
        >
          <ThumbsDown className="w-4 h-4" />
          <span>Not for me</span>
        </button>

        {/* Share */}
        {canNativeShare ? (
          <button
            onClick={() => handleShare()}
            title="Share"
            className="flex items-center justify-center min-w-[44px] min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 active:bg-stone-200 dark:active:bg-slate-600 transition-all"
          >
            <Share2 className="w-4 h-4" />
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Share"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] px-3 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 active:bg-stone-200 dark:active:bg-slate-600 transition-all"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem onClick={() => handleShare('twitter')}>
                <Twitter className="w-4 h-4 mr-2" /> Share on Twitter
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleShare('facebook')}>
                <Facebook className="w-4 h-4 mr-2" /> Share on Facebook
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleShare('linkedin')}>
                <Linkedin className="w-4 h-4 mr-2" /> Share on LinkedIn
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleShare('copy')}>
                <Link2 className="w-4 h-4 mr-2" /> Copy Link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          title={isSaved ? 'Unsave' : 'Save'}
          className={`flex items-center justify-center min-w-[44px] min-h-[44px] px-3 rounded-xl border transition-all ${
            isSaved
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600'
              : 'border-stone-200 dark:border-slate-700 text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 active:bg-stone-200 dark:active:bg-slate-600'
          }`}
        >
          {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

    </div>
  );
}
