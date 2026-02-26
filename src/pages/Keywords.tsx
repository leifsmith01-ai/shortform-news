import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, Plus, X, Lock, Newspaper, Search, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import NewsCard from '@/components/news/NewsCard'
import LoadingCard from '@/components/news/LoadingCard'
import api from '@/api'
import { useUser } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'

interface Keyword {
  id: string
  keyword: string
  created_at: string
}

export default function Keywords() {
  const { isSignedIn, isLoaded } = useUser()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [selectedKeyword, setSelectedKeyword] = useState<Keyword | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false)
  const [articles, setArticles] = useState<any[]>([])
  const [isLoadingArticles, setIsLoadingArticles] = useState(false)
  const [dateRange, setDateRange] = useState<'24h' | '3d' | 'week'>('24h')
  // Ref for aborting in-flight keyword fetches
  const abortRef = React.useRef<AbortController | null>(null)

  // Load saved keywords on mount (sign-in required)
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setIsLoadingKeywords(true)
    api.getKeywords()
      .then(kws => {
        setKeywords(kws)
        if (kws.length > 0) setSelectedKeyword(kws[0])
      })
      .catch(() => toast.error('Failed to load keywords'))
      .finally(() => setIsLoadingKeywords(false))
  }, [isLoaded, isSignedIn])

  // Fetch articles whenever selected keyword changes.
  // The backend keyword search is now country/category-aware but for the
  // Keywords page we do a broad global search — the backend handles LLM
  // expansion, keyword relevance scoring, and result caching automatically.
  const fetchArticlesForKeyword = useCallback(async (kw: Keyword) => {
    // Cancel any previous in-flight fetch
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoadingArticles(true)
    setArticles([])
    try {
      const result = await api.fetchNews({
        countries: ['world'],
        categories: ['world'],
        searchQuery: kw.keyword,
        dateRange,
      })
      if (controller.signal.aborted) return
      setArticles(result?.articles ?? [])
    } catch (err) {
      if (controller.signal.aborted) return
      toast.error(`Failed to fetch articles for "${kw.keyword}"`)
      setArticles([])
    } finally {
      if (!controller.signal.aborted) setIsLoadingArticles(false)
    }
  }, [dateRange])

  useEffect(() => {
    if (selectedKeyword) fetchArticlesForKeyword(selectedKeyword)
  }, [selectedKeyword, fetchArticlesForKeyword])

  const handleAdd = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || !isSignedIn) return

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
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
              Custom Keywords &amp; Searches
            </h1>
            <p className="text-sm text-stone-500 dark:text-slate-400">
              {isLoaded && isSignedIn
                ? `${keywords.length} saved keyword${keywords.length !== 1 ? 's' : ''}`
                : 'Sign in to save and track keywords'}
            </p>
          </div>
        </div>
      </header>

      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3 w-64">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-white rounded-full animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {isLoaded && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left sidebar — search input + keyword tags (top strip on mobile, sidebar on desktop) */}
          <aside className="w-full lg:w-72 flex-shrink-0 bg-white dark:bg-slate-800 border-b lg:border-b-0 lg:border-r border-stone-200 dark:border-slate-700 flex flex-col">

            {/* Add keyword input */}
            <div className="p-3 lg:p-4 border-b border-stone-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-2 lg:mb-3 hidden lg:block">
                Add Keyword or Search
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                  <Input
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isSignedIn ? 'e.g., climate change, AI…' : 'Sign in to search…'}
                    className="pl-8 h-9 rounded-lg border-stone-200 dark:border-slate-600 dark:bg-slate-700 dark:text-stone-100 dark:placeholder:text-slate-500 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    maxLength={60}
                    disabled={!isSignedIn || isSubmitting}
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={!isSignedIn || isSubmitting || !inputValue.trim()}
                  size="icon"
                  className="h-9 w-9 bg-slate-900 hover:bg-slate-800 rounded-lg flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isSignedIn ? 'Add keyword' : 'Sign in to add keywords'}
                >
                  {isSignedIn ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </Button>
              </div>

              {isSignedIn ? (
                <p className="text-xs text-stone-400 dark:text-slate-500 mt-2 hidden lg:block">Press Enter to add</p>
              ) : (
                <Link
                  to="/sign-in"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <LogIn className="w-3 h-3" />
                  Sign in to save keywords
                </Link>
              )}
            </div>

            {/* Keyword tags — horizontal scroll on mobile, wrapped list on desktop */}
            <div className="lg:flex-1 lg:overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 lg:p-4">
                  {!isSignedIn ? (
                    <div className="flex flex-col items-center justify-center py-4 lg:py-10 text-center">
                      <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-slate-700 flex items-center justify-center mb-3 hidden lg:flex">
                        <Lock className="w-5 h-5 text-stone-400 dark:text-slate-500" />
                      </div>
                      <p className="text-sm text-stone-500 dark:text-slate-400 font-medium mb-1">Sign in to get started</p>
                      <p className="text-xs text-stone-400 dark:text-slate-500 mb-4 hidden lg:block">Save keywords and track custom news feeds.</p>
                      <Link to="/sign-in">
                        <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white gap-2 h-8 text-xs">
                          <LogIn className="w-3.5 h-3.5" />
                          Sign In
                        </Button>
                      </Link>
                    </div>
                  ) : isLoadingKeywords ? (
                    <div className="flex flex-nowrap lg:flex-wrap gap-2 overflow-x-auto lg:overflow-x-visible">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-8 w-20 bg-stone-100 dark:bg-slate-700 rounded-full animate-pulse flex-shrink-0" />
                      ))}
                    </div>
                  ) : keywords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 lg:py-10 text-center">
                      <Tag className="w-6 h-6 text-stone-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-stone-400 dark:text-slate-500">No keywords yet.</p>
                      <p className="text-xs text-stone-300 dark:text-slate-600 mt-1 hidden lg:block">Add one above to create your first feed.</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      <div className="flex flex-nowrap lg:flex-wrap gap-2 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0">
                        {keywords.map(kw => (
                          <motion.span
                            key={kw.id}
                            layout
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            onClick={() => setSelectedKeyword(kw)}
                            className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm font-medium cursor-pointer select-none transition-colors flex-shrink-0 lg:flex-shrink ${
                              selectedKeyword?.id === kw.id
                                ? 'bg-slate-900 text-white'
                                : 'bg-stone-100 dark:bg-slate-700 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {kw.keyword}
                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(kw) }}
                              className={`rounded-full p-0.5 transition-colors flex-shrink-0 ${
                                selectedKeyword?.id === kw.id
                                  ? 'hover:bg-white/20 text-slate-300 hover:text-white'
                                  : 'hover:bg-stone-300 text-stone-400 hover:text-stone-600'
                              }`}
                              aria-label={`Remove ${kw.keyword}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </motion.span>
                        ))}
                      </div>
                    </AnimatePresence>
                  )}
                </div>
              </ScrollArea>
            </div>
          </aside>

          {/* Main content — article feed for selected keyword */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedKeyword ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <Newspaper className="w-12 h-12 text-stone-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-stone-700 dark:text-slate-300 mb-1">
                  {isSignedIn ? 'No keyword selected' : 'Sign in to get started'}
                </h3>
                <p className="text-stone-400 dark:text-slate-500 text-sm max-w-xs">
                  {isSignedIn
                    ? 'Add a keyword on the left to create your first custom feed.'
                    : 'Sign in to save keywords and track custom news feeds.'}
                </p>
                {!isSignedIn && (
                  <Link to="/sign-in" className="mt-4">
                    <Button className="bg-slate-900 hover:bg-slate-800 text-white gap-2">
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <>
                {/* Feed header */}
                <div className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-6 py-3 flex items-center gap-3 flex-shrink-0">
                  <Tag className="w-4 h-4 text-stone-400 dark:text-slate-500" />
                  <span className="font-semibold text-stone-900 dark:text-stone-100 capitalize">{selectedKeyword.keyword}</span>
                  <div className="ml-auto flex items-center gap-3">
                    {/* Timeframe picker */}
                    <div className="flex items-center gap-1">
                      {(['24h', '3d', 'week'] as const).map(range => (
                        <button
                          key={range}
                          onClick={() => setDateRange(range)}
                          className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                            dateRange === range
                              ? 'bg-slate-900 text-white'
                              : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {range === '24h' ? '24h' : range === '3d' ? '3 days' : '1 week'}
                        </button>
                      ))}
                    </div>
                    {!isLoadingArticles && (
                      <span className="text-xs text-stone-400 dark:text-slate-500">
                        {articles.length} article{articles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
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
                        <Newspaper className="w-10 h-10 text-stone-300 dark:text-slate-600 mb-4" />
                        <h3 className="text-lg font-semibold text-stone-700 dark:text-slate-300 mb-1">No articles found</h3>
                        <p className="text-stone-400 dark:text-slate-500 text-sm max-w-xs">
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
    </div>
  )
}
