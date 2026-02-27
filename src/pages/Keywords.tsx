import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, Plus, X, Lock, Newspaper, Search, LogIn, Globe, CrosshairIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

// Country options for the region focus selector.
// 'world' = no geographic filter (search globally).
const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: 'world', label: 'Global' },
  { value: 'au', label: 'Australia' },
  { value: 'us', label: 'United States' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'nz', label: 'New Zealand' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'in', label: 'India' },
  { value: 'jp', label: 'Japan' },
  { value: 'sg', label: 'Singapore' },
  { value: 'ae', label: 'UAE' },
  { value: 'za', label: 'South Africa' },
  { value: 'br', label: 'Brazil' },
  { value: 'kr', label: 'South Korea' },
  { value: 'it', label: 'Italy' },
  { value: 'es', label: 'Spain' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'se', label: 'Sweden' },
  { value: 'no', label: 'Norway' },
  { value: 'ie', label: 'Ireland' },
]

// Persist preferences to localStorage so they survive page refreshes
const STORAGE_KEY_REGION = 'kw-region'
const STORAGE_KEY_STRICT = 'kw-strict'

function loadPersistedRegion(): string {
  try { return localStorage.getItem(STORAGE_KEY_REGION) || 'world' } catch { return 'world' }
}
function loadPersistedStrict(): boolean {
  try { return localStorage.getItem(STORAGE_KEY_STRICT) === 'true' } catch { return false }
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

  // Region focus — persisted to localStorage
  const [region, setRegion] = useState<string>(loadPersistedRegion)
  // Strict/headline-match mode — persisted to localStorage
  const [strictMode, setStrictMode] = useState<boolean>(loadPersistedStrict)

  // Ref for aborting in-flight keyword fetches
  const abortRef = React.useRef<AbortController | null>(null)

  // Persist preferences when they change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_REGION, region) } catch {}
  }, [region])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_STRICT, String(strictMode)) } catch {}
  }, [strictMode])

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

  // Fetch articles whenever selected keyword, date range, region, or strict mode changes.
  // Uses mode: 'keyword' to activate dedicated monitoring-grade relevance logic
  // in the backend (tighter LLM expansion, min relevance threshold, keyword-dominant ranking).
  const fetchArticlesForKeyword = useCallback(async (kw: Keyword) => {
    // Cancel any previous in-flight fetch
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoadingArticles(true)
    setArticles([])
    try {
      const countries = region === 'world' ? ['world'] : [region]
      const result = await api.fetchNews({
        countries,
        categories: ['world'],
        searchQuery: kw.keyword,
        dateRange,
        mode: 'keyword',
        strictMode,
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
  }, [dateRange, region, strictMode])

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

  const regionLabel = REGION_OPTIONS.find(r => r.value === region)?.label ?? 'Global'

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
              Keyword Monitor
            </h1>
            <p className="text-sm text-stone-500 dark:text-slate-400">
              {isLoaded && isSignedIn
                ? `${keywords.length} tracked keyword${keywords.length !== 1 ? 's' : ''}`
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
              <div key={i} className="h-10 rounded-full skeleton-shimmer" />
            ))}
          </div>
        </div>
      )}

      {isLoaded && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left sidebar — search input + keyword tags + monitoring controls */}
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
                <p className="text-xs text-stone-400 dark:text-slate-500 mt-2 hidden lg:block">Press Enter to add. Supports boolean: AND, OR, NOT</p>
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

            {/* Monitoring controls — region focus + strict mode */}
            {isSignedIn && (
              <div className="p-3 lg:p-4 border-b border-stone-100 dark:border-slate-700 space-y-3">
                <p className="text-xs font-semibold text-stone-400 dark:text-slate-500 uppercase tracking-wide hidden lg:block">
                  Monitor Settings
                </p>

                {/* Region focus selector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-stone-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Globe className="w-3 h-3" />
                    Region Focus
                  </label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="h-8 text-xs border-stone-200 dark:border-slate-600 dark:bg-slate-700 dark:text-stone-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Strict headline-match toggle */}
                <button
                  onClick={() => setStrictMode(prev => !prev)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    strictMode
                      ? 'bg-slate-900 text-white dark:bg-slate-600'
                      : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <CrosshairIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 text-left">Headline Match Only</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    strictMode
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-200 dark:bg-slate-600 text-stone-500 dark:text-slate-400'
                  }`}>
                    {strictMode ? 'ON' : 'OFF'}
                  </span>
                </button>
                <p className="text-[10px] text-stone-400 dark:text-slate-500 leading-tight hidden lg:block">
                  {strictMode
                    ? 'Only showing articles with keyword in the headline — highest precision.'
                    : 'Showing all matching articles ranked by relevance.'}
                </p>
              </div>
            )}

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
                        <div key={i} className="h-8 w-20 rounded-full skeleton-shimmer flex-shrink-0" />
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

                  {/* Active filter badges */}
                  <div className="flex items-center gap-1.5">
                    {region !== 'world' && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        {regionLabel}
                      </span>
                    )}
                    {strictMode && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                        Headlines
                      </span>
                    )}
                  </div>

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
                          No recent articles matched "{selectedKeyword.keyword}"
                          {region !== 'world' ? ` in ${regionLabel}` : ''}
                          {strictMode ? ' (headline match)' : ''}.
                          {strictMode
                            ? ' Try turning off "Headline Match Only" for broader results.'
                            : ' Try a broader term or check back later.'}
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
