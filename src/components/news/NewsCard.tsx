import React, { useContext, useState } from 'react';
import { ExternalLink, Clock, Bookmark, BookmarkCheck, Share2, Twitter, Facebook, Linkedin, Link2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from '@/api';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { ApiReadyContext } from '@/App';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const COUNTRY_FLAGS: Record<string, string> = {
  // North America
  us: '🇺🇸', ca: '🇨🇦', mx: '🇲🇽', cu: '🇨🇺', jm: '🇯🇲',
  cr: '🇨🇷', pa: '🇵🇦', do: '🇩🇴', gt: '🇬🇹', hn: '🇭🇳',
  // South America
  br: '🇧🇷', ar: '🇦🇷', cl: '🇨🇱', co: '🇨🇴', pe: '🇵🇪',
  ve: '🇻🇪', ec: '🇪🇨', uy: '🇺🇾', py: '🇵🇾', bo: '🇧🇴',
  // Europe
  gb: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', it: '🇮🇹', es: '🇪🇸',
  nl: '🇳🇱', se: '🇸🇪', no: '🇳🇴', pl: '🇵🇱', ch: '🇨🇭',
  be: '🇧🇪', at: '🇦🇹', ie: '🇮🇪', pt: '🇵🇹', dk: '🇩🇰',
  fi: '🇫🇮', gr: '🇬🇷', cz: '🇨🇿', ro: '🇷🇴', hu: '🇭🇺',
  ua: '🇺🇦', rs: '🇷🇸', hr: '🇭🇷', bg: '🇧🇬', sk: '🇸🇰',
  lt: '🇱🇹', lv: '🇱🇻', ee: '🇪🇪', is: '🇮🇸', lu: '🇱🇺',
  // Asia
  cn: '🇨🇳', jp: '🇯🇵', in: '🇮🇳', kr: '🇰🇷', sg: '🇸🇬',
  hk: '🇭🇰', tw: '🇹🇼', id: '🇮🇩', th: '🇹🇭', my: '🇲🇾',
  ph: '🇵🇭', vn: '🇻🇳', pk: '🇵🇰', bd: '🇧🇩', lk: '🇱🇰',
  mm: '🇲🇲', kh: '🇰🇭', np: '🇳🇵',
  // Middle East
  il: '🇮🇱', ae: '🇦🇪', sa: '🇸🇦', tr: '🇹🇷', qa: '🇶🇦',
  kw: '🇰🇼', bh: '🇧🇭', om: '🇴🇲', jo: '🇯🇴', lb: '🇱🇧',
  iq: '🇮🇶', ir: '🇮🇷',
  // Africa
  za: '🇿🇦', ng: '🇳🇬', eg: '🇪🇬', ke: '🇰🇪', ma: '🇲🇦',
  gh: '🇬🇭', et: '🇪🇹', tz: '🇹🇿', ug: '🇺🇬', sn: '🇸🇳',
  ci: '🇨🇮', cm: '🇨🇲', dz: '🇩🇿', tn: '🇹🇳', rw: '🇷🇼',
  // Oceania
  au: '🇦🇺', nz: '🇳🇿', fj: '🇫🇯', pg: '🇵🇬',
};

const CATEGORY_COLORS = {
  technology: 'bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-700',
  business: 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-700',
  science: 'bg-purple-500/10 text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-700',
  health: 'bg-rose-500/10 text-rose-600 border-rose-200 dark:text-rose-400 dark:border-rose-700',
  sports: 'bg-orange-500/10 text-orange-600 border-orange-200 dark:text-orange-400 dark:border-orange-700',
  gaming: 'bg-violet-500/10 text-violet-600 border-violet-200 dark:text-violet-400 dark:border-violet-700',
  film: 'bg-pink-500/10 text-pink-600 border-pink-200 dark:text-pink-400 dark:border-pink-700',
  tv: 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-200 dark:text-fuchsia-400 dark:border-fuchsia-700',
  music: 'bg-yellow-500/10 text-yellow-600 border-yellow-200 dark:text-yellow-400 dark:border-yellow-700',
  politics: 'bg-slate-500/10 text-slate-600 border-slate-200 dark:text-slate-400 dark:border-slate-600',
  world: 'bg-cyan-500/10 text-cyan-600 border-cyan-200 dark:text-cyan-400 dark:border-cyan-700',
};

export default function NewsCard({ article, index, rank, isPriority = false }) {
  const [isSaved, setIsSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);
  const [isReacting, setIsReacting] = useState(false);
  const apiReady = useContext(ApiReadyContext);
  const { isSignedIn } = useUser();
  const navigate = useNavigate();

  const handleSave = async (e) => {
    e.preventDefault();

    if (!isSignedIn) {
      toast.error('Sign in to save articles');
      navigate('/sign-in');
      return;
    }

    setIsSaving(true);
    try {
      if (isSaved && savedId) {
        await api.unsaveArticle(savedId);
        toast.success('Article unsaved');
        setIsSaved(false);
        setSavedId(null);
      } else {
        const result = await api.saveArticle({
          ...article,
          saved_date: new Date().toISOString()
        });
        toast.success('Article saved!');
        setIsSaved(true);
        if (result && (result as Record<string, unknown>).id) {
          setSavedId((result as Record<string, unknown>).id as string);
        }
      }
    } catch (error) {
      toast.error('Failed to save article');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArticleClick = async () => {
    // Only record when the Supabase connection is ready — if we're still
    // initialising, api.addToHistory() would silently fall back to localStorage
    // and the data would never appear on the Supabase-backed History page.
    if (!isSignedIn || !apiReady) return;
    try {
      await api.addToHistory({
        article_title: article.title,
        article_url: article.url,
        source: article.source,
        country: article.country,
        category: article.category,
        read_date: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to track reading:', error);
    }
  };

  const handleReaction = async (e: React.MouseEvent, r: 'up' | 'down') => {
    e.preventDefault();
    if (!isSignedIn) {
      toast.error('Sign in to rate articles');
      navigate('/sign-in');
      return;
    }
    if (isReacting) return;
    setIsReacting(true);
    try {
      if (reaction === r) {
        // Clicking the active reaction removes it
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

  const getSafeArticleUrl = (): string | null => {
    try {
      const parsed = new URL(article.url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      return article.url;
    } catch {
      return null;
    }
  };

  const handleShare = (platform) => {
    const safeUrl = getSafeArticleUrl();
    if (!safeUrl) {
      toast.error('Cannot share: invalid article URL');
      return;
    }

    const url = encodeURIComponent(safeUrl);
    const text = encodeURIComponent(article.title);

    const shareUrls = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };

    if (platform === 'copy') {
      navigator.clipboard.writeText(safeUrl);
      toast.success('Link copied to clipboard!');
    } else if (platform in shareUrls) {
      window.open(shareUrls[platform], '_blank', 'width=600,height=400,noopener,noreferrer');
    }
  };

  const newsArticleSchema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.description || (article.summary_points?.[0] ?? ''),
    url: article.url,
    datePublished: article.publishedAt,
    image: article.image_url || undefined,
    publisher: {
      '@type': 'Organization',
      name: article.source,
    },
  };

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 5) * 50}ms` }}
      className="news-card-enter group bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 overflow-hidden hover:shadow-xl hover:shadow-stone-200/50 dark:hover:shadow-slate-900/50 transition-[box-shadow,transform] duration-500 hover:-translate-y-1 relative"
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleSchema) }} />
      {/* Ranking Badge */}
      <div className="absolute top-4 left-4 z-10 w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
        {rank}
      </div>
      
      {/* Action Buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="bg-white hover:bg-slate-50 rounded-full shadow-lg"
            >
              <Share2 className="w-4 h-4 text-slate-900" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleShare('twitter')}>
              <Twitter className="w-4 h-4 mr-2" />
              Share on Twitter
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleShare('facebook')}>
              <Facebook className="w-4 h-4 mr-2" />
              Share on Facebook
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleShare('linkedin')}>
              <Linkedin className="w-4 h-4 mr-2" />
              Share on LinkedIn
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleShare('copy')}>
              <Link2 className="w-4 h-4 mr-2" />
              Copy Link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <Button
          size="icon"
          variant="secondary"
          className="bg-white hover:bg-slate-50 rounded-full shadow-lg"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaved ? (
            <BookmarkCheck className="w-5 h-5 text-slate-900" />
          ) : (
            <Bookmark className="w-5 h-5 text-slate-900" />
          )}
        </Button>
      </div>

      {/* Image */}
      {article.image_url && !imageError && (
        <div className="aspect-[16/9] overflow-hidden bg-stone-100 dark:bg-slate-700">
          <img
            src={article.image_url}
            alt={article.title}
            loading={isPriority ? 'eager' : 'lazy'}
            fetchPriority={isPriority ? 'high' : 'auto'}
            className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-700 ${
              imageLoaded || isPriority ? '' : 'blur-sm scale-105'
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      )}

      <div className="p-6">
        {/* Meta */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xl">{COUNTRY_FLAGS[article.country] || '🌍'}</span>
          <Badge variant="outline" className={`text-xs font-medium ${CATEGORY_COLORS[article.category] || 'bg-stone-100 text-stone-600'}`}>
            {article.category}
          </Badge>
          {article.language && article.language !== 'en' && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 uppercase tracking-wide"
              title={`Article in ${article.language.toUpperCase()}`}
            >
              {article.language.toUpperCase()}
            </span>
          )}
          <div className="flex items-center gap-1 text-xs text-stone-400 dark:text-slate-500 ml-auto">
            <Clock className="w-3 h-3" />
            <span>{article.time_ago || 'Today'}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 leading-snug mb-3 line-clamp-2 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
          {article.title}
        </h3>

        {/* Source */}
        <p className="text-xs text-stone-400 dark:text-slate-500 mb-4 uppercase tracking-wide">
          {article.source}
        </p>

        {/* AI Summary Bullets */}
        {article.summary_points && article.summary_points.length > 0 ? (
          <div className="bg-stone-50 dark:bg-slate-700/50 rounded-xl p-4 mb-4 border border-stone-100 dark:border-slate-600">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-slate-900 dark:bg-slate-600 flex items-center justify-center">
                <span className="text-xs">✨</span>
              </div>
              <span className="text-xs font-semibold text-stone-500 dark:text-slate-400 uppercase tracking-wider">AI Summary</span>
            </div>
            <ul className="space-y-2">
              {article.summary_points.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-stone-700 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900 dark:bg-slate-400 mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-stone-50 dark:bg-slate-700/30 border border-stone-100 dark:border-slate-700">
            <span className="text-xs text-stone-400 dark:text-slate-500 italic">Summary unavailable</span>
          </div>
        )}

        {/* Read More */}
        <a
          href={getSafeArticleUrl() ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleArticleClick}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-200 hover:text-slate-700 dark:hover:text-slate-400 transition-colors group/link"
        >
          Read full article
          <ExternalLink className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
        </a>

        {/* Reaction row — influences the For You feed */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-stone-100 dark:border-slate-700">
          <span className="text-xs text-stone-400 dark:text-slate-500 flex-1">Relevant to you?</span>
          <button
            onClick={(e) => handleReaction(e, 'up')}
            disabled={isReacting}
            title="Relevant — show me more like this"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              reaction === 'up'
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'text-stone-400 dark:text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-700 hover:text-stone-700 dark:hover:text-slate-300 border border-transparent'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            {reaction === 'up' && <span>Yes</span>}
          </button>
          <button
            onClick={(e) => handleReaction(e, 'down')}
            disabled={isReacting}
            title="Not relevant — show me less like this"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              reaction === 'down'
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                : 'text-stone-400 dark:text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-700 hover:text-stone-700 dark:hover:text-slate-300 border border-transparent'
            }`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            {reaction === 'down' && <span>No</span>}
          </button>
        </div>
      </div>
    </article>
  );
}
