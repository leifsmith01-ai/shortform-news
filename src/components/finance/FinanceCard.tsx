import React, { useState } from 'react';
import { ExternalLink, Clock, Bookmark, BookmarkCheck, Share2, Twitter, Facebook, Linkedin, Link2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from '@/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MARKET_COLORS: Record<string, string> = {
  stocks: 'bg-blue-500/10 text-blue-600 border-blue-200',
  crypto: 'bg-orange-500/10 text-orange-600 border-orange-200',
  forex: 'bg-violet-500/10 text-violet-600 border-violet-200',
  commodities: 'bg-amber-500/10 text-amber-600 border-amber-200',
  bonds: 'bg-slate-500/10 text-slate-600 border-slate-200',
  realestate: 'bg-teal-500/10 text-teal-600 border-teal-200',
};

const SECTOR_LABELS: Record<string, string> = {
  tech: 'Technology',
  healthcare: 'Healthcare',
  energy: 'Energy',
  financial: 'Financial',
  consumer: 'Consumer',
  industrial: 'Industrial',
  materials: 'Materials',
  utilities: 'Utilities',
};

const REGION_FLAGS: Record<string, string> = {
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
  eu: '🇪🇺',
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
  // Special
  global: '🌍',
};

interface FinanceArticle {
  title: string;
  source: string;
  image_url: string;
  market: string;
  sector: string;
  region?: string;
  url: string;
  time_ago: string;
  views: number;
  summary_points: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  ticker?: string;
  price_change?: number;
}

export default function FinanceCard({ article, index, rank }: { article: FinanceArticle; index: number; rank: number }) {
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (isSaved) {
        toast.success('Article unsaved');
        setIsSaved(false);
      } else {
        await api.saveArticle({
          ...article,
          saved_date: new Date().toISOString()
        });
        toast.success('Article saved!');
        setIsSaved(true);
      }
    } catch {
      toast.error('Failed to save article');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArticleClick = async () => {
    try {
      await api.addToHistory({
        article_title: article.title,
        article_url: article.url,
        source: article.source,
        country: article.region,
        category: `finance-${article.market}`,
        read_date: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to track reading:', error);
    }
  };

  const handleShare = (platform: string) => {
    const url = encodeURIComponent(article.url);
    const text = encodeURIComponent(article.title);

    const shareUrls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };

    if (platform === 'copy') {
      navigator.clipboard.writeText(article.url);
      toast.success('Link copied to clipboard!');
    } else {
      window.open(shareUrls[platform], '_blank', 'width=600,height=400');
    }
  };

  const SentimentIcon = article.sentiment === 'bullish' ? TrendingUp : article.sentiment === 'bearish' ? TrendingDown : Minus;
  const sentimentColor = article.sentiment === 'bullish' ? 'text-emerald-600' : article.sentiment === 'bearish' ? 'text-red-600' : 'text-stone-500';
  const sentimentBg = article.sentiment === 'bullish' ? 'bg-emerald-50 border-emerald-200' : article.sentiment === 'bearish' ? 'bg-red-50 border-red-200' : 'bg-stone-50 border-stone-200';

  return (
    <article
      className="group bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-xl hover:shadow-stone-200/50 transition-all duration-500 hover:-translate-y-1 relative"
    >
      {/* Ranking Badge */}
      <div className="absolute top-4 left-4 z-10 w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
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
      {article.image_url && (
        <div className="aspect-[16/9] overflow-hidden">
          <img
            src={article.image_url}
            alt={article.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="p-6">
        {/* Meta */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xl">{REGION_FLAGS[article.region] || '🌍'}</span>
          <Badge variant="outline" className={`text-xs font-medium ${MARKET_COLORS[article.market] || 'bg-stone-100 text-stone-600'}`}>
            {article.market}
          </Badge>
          {article.sector && (
            <Badge variant="outline" className="text-xs font-medium bg-stone-100 text-stone-600 border-stone-200">
              {SECTOR_LABELS[article.sector] || article.sector}
            </Badge>
          )}
          <div className="flex items-center gap-1 text-xs text-stone-400 ml-auto">
            <Clock className="w-3 h-3" />
            <span>{article.time_ago || 'Today'}</span>
          </div>
        </div>

        {/* Sentiment & Ticker */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${sentimentBg} ${sentimentColor}`}>
            <SentimentIcon className="w-3.5 h-3.5" />
            <span className="capitalize">{article.sentiment}</span>
          </div>
          {article.ticker && (
            <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">
              ${article.ticker}
            </span>
          )}
          {article.price_change !== undefined && (
            <span className={`text-xs font-semibold ${article.price_change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {article.price_change >= 0 ? '+' : ''}{article.price_change.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Time ago */}
        {article.time_ago && (
          <div className="flex items-center gap-1 text-xs text-stone-500 mb-3">
            <span>{article.time_ago}</span>
          </div>
        )}

        {/* Title */}
        <h3 className="text-lg font-semibold text-stone-900 leading-snug mb-3 line-clamp-2 group-hover:text-slate-700 transition-colors">
          {article.title}
        </h3>

        {/* Source */}
        <p className="text-xs text-stone-400 mb-4 uppercase tracking-wide">
          {article.source}
        </p>

        {/* AI Summary Bullets */}
        <div className="bg-stone-50 rounded-xl p-4 mb-4 border border-stone-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-md bg-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">AI Analysis</span>
          </div>
          <ul className="space-y-2">
            {article.summary_points?.map((point: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-stone-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 flex-shrink-0" />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Read More */}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleArticleClick}
          className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-600 transition-colors group/link"
        >
          Read full article
          <ExternalLink className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
        </a>
      </div>
    </article>
  );
}
