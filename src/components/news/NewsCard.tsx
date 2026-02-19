import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Clock, Bookmark, BookmarkCheck, Share2, Twitter, Facebook, Linkedin, Link2 } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from '@/api';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
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
  technology: 'bg-blue-500/10 text-blue-600 border-blue-200',
  business: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  science: 'bg-purple-500/10 text-purple-600 border-purple-200',
  health: 'bg-rose-500/10 text-rose-600 border-rose-200',
  sports: 'bg-orange-500/10 text-orange-600 border-orange-200',
  entertainment: 'bg-pink-500/10 text-pink-600 border-pink-200',
  politics: 'bg-slate-500/10 text-slate-600 border-slate-200',
  world: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
};

export default function NewsCard({ article, index, rank }) {
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageError, setImageError] = useState(false);
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
    } catch (error) {
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
        country: article.country,
        category: article.category,
        read_date: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to track reading:', error);
    }
  };

  const handleShare = (platform) => {
    const url = encodeURIComponent(article.url);
    const text = encodeURIComponent(article.title);
    
    const shareUrls = {
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className="group bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-xl hover:shadow-stone-200/50 transition-all duration-500 hover:-translate-y-1 relative"
    >
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
        <div className="aspect-[16/9] overflow-hidden bg-stone-100">
          <img
            src={article.image_url}
            alt={article.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
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
          <div className="flex items-center gap-1 text-xs text-stone-400 ml-auto">
            <Clock className="w-3 h-3" />
            <span>{article.time_ago || 'Today'}</span>
          </div>
        </div>

        {/* Views */}
        {article.views && (
          <div className="flex items-center gap-1 text-xs text-stone-500 mb-3">
            <span className="font-semibold">{article.views.toLocaleString()}</span>
            <span>views</span>
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

        {/* AI Summary Bullets — only shown when summaries were generated */}
        {article.summary_points && article.summary_points.length > 0 && (
          <div className="bg-stone-50 rounded-xl p-4 mb-4 border border-stone-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-slate-900 flex items-center justify-center">
                <span className="text-xs">✨</span>
              </div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">AI Summary</span>
            </div>
            <ul className="space-y-2">
              {article.summary_points.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-stone-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Read More */}
        <a 
          href={article.url} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={handleArticleClick}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 hover:text-slate-700 transition-colors group/link"
        >
          Read full article
          <ExternalLink className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
        </a>
      </div>
    </motion.article>
  );
}
