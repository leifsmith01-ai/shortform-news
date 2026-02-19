import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, Plus, X, Zap, Lock, Newspaper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { usePremium } from '@/hooks/usePremium'
import PremiumModal from '@/components/PremiumModal'
import NewsCard from '@/components/news/NewsCard'
import LoadingCard from '@/components/news/LoadingCard'
import api from '@/api'
import { useSession, useUser } from '@clerk/clerk-react'

interface Keyword {
  id: string
  keyword: string
  created_at: string
}

// Broad search — use a wide spread of countries and all categories
const SEARCH_COUNTRIES = ['us', 'gb', 'au', 'ca', 'nz', 'in', 'sg', 'za']
const SEARCH_CATEGORIES = ['technology', 'business', 'science', 'health', 'sports', 'entertainment', 'politics', 'world']

function PremiumGate({ onUpgradeClick }: { onUpgradeClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full min-h-[500px] text-center px-6"
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6 border border-amber-200">
        <Lock className="w-10 h-10 text-amber-500" />
      </div>
      <h3 className="text-2xl font-semibold text-stone-900 mb-2">
        Keyword Tracking is Premium
      </h3>
      <p className="text-stone-500 max-w-sm mb-8 leading-relaxed">
        Create your own custom news feeds for any topic — your brand, your industry, your city. Track what matters to you.
      </p>
      <Button
        onClick={onUpgradeClick}
        className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold h-11 px-8 gap-2"
      >
        <Zap className="w-4 h-4" />
        Upgrade to Premium
      </Button>
    </motion.div>
  )
}

export default function Keywords() {
  const { isPremium, isLoaded } = usePremium()
  const { session } = useSession()
  const { isSignedIn } = useUser()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [selectedKeyword, setSelectedKeyword] = useState<Keyword | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false)
  const [articles, setArticles] = useState<any[]>([])
  const [isLoadingArticles, setIsLoadingArticles] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)

  // Dev/testing: upgrade the signed-in user's account to premium via the backend API
  const handleEnablePremium = async () => {
    if (!session) { toast.error('You must be signed in to enable premium'); return }
    setIsUpgrading(true)
    try {
      const token = await session.getToken()
      const res = await fetch('/api/admin-set-premium', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upgrade')
      toast.success('Account upgraded to premium! Refreshing…')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upgrade failed')
    } finally {
      setIsUpgrading(false)
    }
  }

  // Load saved keywords on mount
  useEffect(() => {
    if (!isLoaded || !isPremium) return
    setIsLoadingKeywords(true)
    api.getKeywords()
      .then(kws => {
        setKeywords(kws)
        if (kws.length > 0) setSelectedKeyword(kws[0])
      })
      .catch(() => toast.error('Failed to load keywords'))
      .finally(() => setIsLoadingKeywords(false))
  }, [isLoaded, isPremium])

  // Fetch articles whenever selected keyword changes
  const fetchArticlesForKeyword = useCallback(async (kw: Keyword) => {
    setIsLoadingArticles(true)
    setArticles([])
    try {
      const result = await api.fetchNews({
        countries: SEARCH_COUNTRIES,
        categories: SEARCH_CATEGORIES,
        searchQuery: kw.keyword,
        dateRange: 'week',
      })
      setArticles(result?.articles ?? [])
    } catch {
      toast.error(`Failed to fetch articles for "${kw.keyword}"`)
      setArticles([])
    } finally {
      setIsLoadingArticles(false)
    }
  }, [])

  useEffect(() => {
    if (selectedKeyword) fetchArticlesForKeyword(selectedKeyword)
  }, [selectedKeyword, fetchArticlesForKeyword])

  const handleAdd = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    setIsSubmitting(true)
    try {
      const newKeyword = await api.addKeyword(trimmed)
      setKeywords(prev => [newKeyword, ...prev])
      setSelectedKeyword(newKeyword)
      setInputValue('')
      toast.success(`Now tracking "${trimmed}"`)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('23505') || msg.toLowerCase().includes('unique')) {
        toast.error('You are already tracking that keyword')
      } else {
        toast.error('Failed to add keyword')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (kw: Keyword) => {
    const previous = keywords
    const wasSelected = selectedKeyword?.id === kw.id

    setKeywords(prev => prev.filter(k => k.id !== kw.id))

    // Select a neighbouring keyword if we deleted the active one
    if (wasSelected) {
      const remaining = previous.filter(k => k.id !== kw.id)
      setSelectedKeyword(remaining.length > 0 ? remaining[0] : null)
      if (remaining.length === 0) setArticles([])
    }

    try {
      await api.deleteKeyword(kw.id)
      toast.success('Keyword removed')
    } catch {
      setKeywords(previous)
      toast.error('Failed to remove keyword')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <div className="h-full flex flex-col bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <Tag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              Keyword Feeds
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                PRO
              </span>
            </h1>
            <p className="text-sm text-stone-500">
              {isPremium && isLoaded
                ? `${keywords.length} custom feed${keywords.length !== 1 ? 's' : ''}`
                : 'Premium feature'}
            </p>
          </div>
        </div>
      </header>

      {/* Body */}
      {!isLoaded && (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3 w-64">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-white rounded-full animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {isLoaded && !isPremium && (
        <div className="flex-1 overflow-auto flex flex-col">
          <PremiumGate onUpgradeClick={() => setModalOpen(true)} />
          {/* Dev tool: enable premium for your account to test this feature */}
          {isSignedIn && (
            <div className="border-t border-stone-200 p-4 flex flex-col items-center gap-2">
              <p className="text-xs text-stone-400 text-center">
                Developer / testing tool
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnablePremium}
                disabled={isUpgrading}
                className="text-xs border-stone-300 text-stone-500 hover:text-stone-900"
              >
                {isUpgrading ? 'Upgrading…' : 'Enable Premium on my account'}
              </Button>
            </div>
          )}
        </div>
      )}

      {isLoaded && isPremium && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar — keyword list + add input */}
          <aside className="w-64 flex-shrink-0 bg-white border-r border-stone-200 flex flex-col">
            {/* Add keyword */}
            <div className="p-4 border-b border-stone-100">
              <div className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add keyword…"
                  className="flex-1 h-9 rounded-lg border-stone-200 text-sm"
                  maxLength={60}
                  disabled={isSubmitting}
                />
                <Button
                  onClick={handleAdd}
                  disabled={isSubmitting || !inputValue.trim()}
                  size="icon"
                  className="h-9 w-9 bg-slate-900 hover:bg-slate-800 rounded-lg flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-stone-400 mt-2">Press Enter to add</p>
            </div>

            {/* Keyword list */}
            <ScrollArea className="flex-1">
              <div className="p-2">
                {isLoadingKeywords ? (
                  <div className="space-y-2 p-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-9 bg-stone-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : keywords.length === 0 ? (
                  <div className="p-4 text-center">
                    <Tag className="w-6 h-6 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs text-stone-400">No keywords yet.</p>
                    <p className="text-xs text-stone-300 mt-1">Add one above to create your first feed.</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {keywords.map(kw => (
                      <motion.div
                        key={kw.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors ${
                          selectedKeyword?.id === kw.id
                            ? 'bg-slate-900 text-white'
                            : 'hover:bg-stone-100 text-stone-700'
                        }`}
                        onClick={() => setSelectedKeyword(kw)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className={`w-3.5 h-3.5 flex-shrink-0 ${selectedKeyword?.id === kw.id ? 'text-slate-300' : 'text-stone-400'}`} />
                          <span className="text-sm font-medium truncate">{kw.keyword}</span>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(kw) }}
                          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                            selectedKeyword?.id === kw.id ? 'hover:bg-white/20' : 'hover:bg-stone-200'
                          }`}
                          aria-label={`Remove ${kw.keyword}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </ScrollArea>
          </aside>

          {/* Main content — article feed for selected keyword */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedKeyword ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <Newspaper className="w-12 h-12 text-stone-300 mb-4" />
                <h3 className="text-lg font-semibold text-stone-700 mb-1">No keyword selected</h3>
                <p className="text-stone-400 text-sm">Add a keyword on the left to create your first custom feed.</p>
              </div>
            ) : (
              <>
                {/* Feed header */}
                <div className="bg-white border-b border-stone-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
                  <Tag className="w-4 h-4 text-stone-400" />
                  <span className="font-semibold text-stone-900 capitalize">{selectedKeyword.keyword}</span>
                  {!isLoadingArticles && (
                    <span className="text-xs text-stone-400 ml-auto">
                      {articles.length} article{articles.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4 lg:p-6">
                    {isLoadingArticles ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => <LoadingCard key={i} />)}
                      </div>
                    ) : articles.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center min-h-[400px] text-center"
                      >
                        <Newspaper className="w-10 h-10 text-stone-300 mb-4" />
                        <h3 className="text-lg font-semibold text-stone-700 mb-1">No articles found</h3>
                        <p className="text-stone-400 text-sm max-w-xs">
                          No recent articles matched "{selectedKeyword.keyword}". Try a broader term or check back later.
                        </p>
                      </motion.div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {articles.map((article, index) => (
                          <NewsCard key={article.url ?? index} article={article} index={index} rank={index + 1} />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        </div>
      )}

      <PremiumModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  )
}
