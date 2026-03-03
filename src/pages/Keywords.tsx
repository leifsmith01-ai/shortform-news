import React, { useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  Tag, Plus, X, Lock, Newspaper, Search, LogIn, Globe, CrosshairIcon,
  Bell, BellOff, Layers, SlidersHorizontal, ChevronDown, FolderPlus,
  Folder, FolderOpen, Trash2, Code2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import NewsCard from '@/components/news/NewsCard'
import LoadingCard from '@/components/news/LoadingCard'
import BooleanQueryBuilder from '@/components/BooleanQueryBuilder'
import api from '@/api'
import { useUser } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import { sanitizeKeyword, isValidKeyword } from '@/lib/sanitize'
import type { Article, Keyword, KeywordTopic, KeywordAlertSetting } from '@/types/article'
import { ApiReadyContext } from '@/App'

// ─── Region options ───────────────────────────────────────────────────────────

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

// ─── LocalStorage persistence ─────────────────────────────────────────────────

const LS = {
  REGION:    'kw-region',
  STRICT:    'kw-strict',
  THRESHOLD: 'kw-threshold',
  BOOL_MODE: 'kw-bool-mode',
}

const load = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}
const save = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { }
}

// ─── Alert modal ──────────────────────────────────────────────────────────────

interface AlertModalProps {
  keyword: Keyword
  existing: KeywordAlertSetting | undefined
  onSave: (email: string, frequency: 'hourly' | 'daily') => Promise<void>
  onDisable: () => Promise<void>
  onClose: () => void
}

function AlertModal({ keyword, existing, onSave, onDisable, onClose }: AlertModalProps) {
  const [email, setEmail] = useState(existing?.email ?? '')
  const [freq, setFreq] = useState<'hourly' | 'daily'>(existing?.frequency ?? 'daily')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!email.includes('@')) { toast.error('Enter a valid email'); return }
    setSaving(true)
    try { await onSave(email, freq); onClose() } finally { setSaving(false) }
  }

  async function handleDisable() {
    setSaving(true)
    try { await onDisable(); onClose() } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Email Alerts — <em className="not-italic font-semibold capitalize">{keyword.keyword}</em>
          </DialogTitle>
          <DialogDescription>
            Get an email digest when new articles match this keyword.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600 dark:text-slate-400">Email address</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600 dark:text-slate-400">Frequency</label>
            <div className="flex gap-2">
              {(['hourly', 'daily'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${freq === f
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-600 dark:border-slate-600'
                    : 'bg-white dark:bg-slate-800 border-stone-200 dark:border-slate-600 text-stone-600 dark:text-slate-400 hover:border-stone-400'
                  }`}
                >
                  {f === 'hourly' ? 'Hourly' : 'Daily digest'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white">
              {saving ? 'Saving…' : 'Enable alerts'}
            </Button>
            {existing?.enabled && (
              <Button onClick={handleDisable} disabled={saving} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                <BellOff className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Topic modal ──────────────────────────────────────────────────────────────

interface TopicModalProps {
  keywords: Keyword[]
  onClose: () => void
  onCreate: (name: string, keywordIds: string[]) => Promise<void>
}

function CreateTopicModal({ keywords, onClose, onCreate }: TopicModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!name.trim()) { toast.error('Enter a feed name'); return }
    if (selected.size === 0) { toast.error('Select at least one keyword'); return }
    setSaving(true)
    try { await onCreate(name.trim(), [...selected]); onClose() } catch { toast.error('Failed to create feed') } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4" /> Create Feed
          </DialogTitle>
          <DialogDescription>Group keywords into a combined feed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Feed name (e.g. Climate Policy)"
            className="h-9 text-sm"
          />
          <div>
            <p className="text-xs font-medium text-stone-600 dark:text-slate-400 mb-2">Select keywords to include</p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {keywords.map(kw => (
                <button
                  key={kw.id}
                  onClick={() => setSelected(prev => {
                    const next = new Set(prev)
                    next.has(kw.id) ? next.delete(kw.id) : next.add(kw.id)
                    return next
                  })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selected.has(kw.id)
                    ? 'bg-slate-900 text-white dark:bg-slate-600'
                    : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200'
                  }`}
                >
                  {kw.keyword}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleCreate} disabled={saving} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
            {saving ? 'Creating…' : 'Create feed'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Selection =
  | { type: 'keyword'; id: string }
  | { type: 'topic'; id: string }

export default function Keywords() {
  const apiReady = useContext(ApiReadyContext)
  const { isSignedIn, isLoaded, user } = useUser()

  // ── Data state ──
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [topics, setTopics] = useState<KeywordTopic[]>([])
  const [alertSettings, setAlertSettings] = useState<KeywordAlertSetting[]>([])

  // ── Selection / articles ──
  const [selection, setSelection] = useState<Selection | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [articleCounts, setArticleCounts] = useState<Record<string, number>>({}) // keywordId → count

  // ── Loading ──
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false)
  const [isLoadingArticles, setIsLoadingArticles] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Input / filters ──
  const [inputValue, setInputValue] = useState('')
  const [dateRange, setDateRange] = useState<'24h' | '3d' | 'week'>('24h')
  const [region, setRegion] = useState<string>(() => load(LS.REGION, 'world'))
  const [strictMode, setStrictMode] = useState<boolean>(() => load(LS.STRICT, false))
  const [threshold, setThreshold] = useState<number>(() => load(LS.THRESHOLD, 0.12))
  const [showBoolBuilder, setShowBoolBuilder] = useState<boolean>(() => load(LS.BOOL_MODE, false))
  const [boolQuery, setBoolQuery] = useState('')

  // ── UI state ──
  const [showThreshold, setShowThreshold] = useState(false)
  const [alertModalKw, setAlertModalKw] = useState<Keyword | null>(null)
  const [showCreateTopic, setShowCreateTopic] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // Persist preferences
  useEffect(() => { save(LS.REGION, region) }, [region])
  useEffect(() => { save(LS.STRICT, strictMode) }, [strictMode])
  useEffect(() => { save(LS.THRESHOLD, threshold) }, [threshold])
  useEffect(() => { save(LS.BOOL_MODE, showBoolBuilder) }, [showBoolBuilder])

  // Load keywords, topics, alert settings
  useEffect(() => {
    if (!apiReady || !isSignedIn) return
    setIsLoadingKeywords(true)
    Promise.all([
      api.getKeywords(),
      api.getTopics().catch(() => [] as KeywordTopic[]),
      api.getAlertSettings().catch(() => [] as KeywordAlertSetting[]),
    ])
      .then(([kws, tops, alerts]) => {
        setKeywords(kws)
        setTopics(tops)
        setAlertSettings(alerts)
        if (kws.length > 0) setSelection({ type: 'keyword', id: kws[0].id })
        // Seed article counts from last_article_count column
        const counts: Record<string, number> = {}
        for (const kw of kws) {
          if (kw.last_article_count) counts[kw.id] = kw.last_article_count
        }
        setArticleCounts(counts)
      })
      .catch(() => toast.error('Failed to load keywords'))
      .finally(() => setIsLoadingKeywords(false))
  }, [apiReady, isSignedIn])

  // ── Fetch articles ─────────────────────────────────────────────────────────

  const fetchArticlesForKeyword = useCallback(async (kw: Keyword) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setIsLoadingArticles(true)
    setArticles([])
    try {
      const query = showBoolBuilder && boolQuery ? boolQuery : sanitizeKeyword(kw.keyword)
      const result = await api.fetchNews({
        countries: region === 'world' ? ['world'] : [region],
        categories: ['world'],
        searchQuery: query,
        dateRange,
        mode: 'keyword',
        strictMode,
        threshold: kw.threshold ?? threshold,
      })
      if (ctrl.signal.aborted) return
      const arts = result?.articles ?? []
      setArticles(arts)
      // Update local count + persist to DB (fire-and-forget)
      setArticleCounts(prev => ({ ...prev, [kw.id]: arts.length }))
      api.updateKeywordArticleCount(kw.id, arts.length).catch(() => {})
    } catch (err) {
      if (ctrl.signal.aborted) return
      toast.error(`Failed to fetch articles for "${kw.keyword}"`)
      setArticles([])
    } finally {
      if (!ctrl.signal.aborted) setIsLoadingArticles(false)
    }
  }, [dateRange, region, strictMode, threshold, showBoolBuilder, boolQuery])

  const fetchArticlesForTopic = useCallback(async (topic: KeywordTopic) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Get the keyword IDs belonging to this topic
    const memberIds = (topic.keyword_topic_members as { keyword_id: string }[] | undefined)?.map(m => m.keyword_id) ?? []
    const topicKeywords = keywords.filter(kw => memberIds.includes(kw.id))
    if (topicKeywords.length === 0) { setArticles([]); return }

    // Build a combined OR query across all topic keywords
    const combinedQuery = topicKeywords.map(kw => kw.keyword.includes(' ') ? `"${kw.keyword}"` : kw.keyword).join(' OR ')

    setIsLoadingArticles(true)
    setArticles([])
    try {
      const result = await api.fetchNews({
        countries: region === 'world' ? ['world'] : [region],
        categories: ['world'],
        searchQuery: combinedQuery,
        dateRange,
        mode: 'keyword',
        strictMode,
        threshold,
      })
      if (ctrl.signal.aborted) return
      setArticles(result?.articles ?? [])
    } catch {
      if (ctrl.signal.aborted) return
      toast.error(`Failed to fetch articles for feed "${topic.name}"`)
      setArticles([])
    } finally {
      if (!ctrl.signal.aborted) setIsLoadingArticles(false)
    }
  }, [keywords, dateRange, region, strictMode, threshold])

  // Trigger fetch whenever selection or filters change
  useEffect(() => {
    if (!selection) return
    if (selection.type === 'keyword') {
      const kw = keywords.find(k => k.id === selection.id)
      if (kw) fetchArticlesForKeyword(kw)
    } else {
      const topic = topics.find(t => t.id === selection.id)
      if (topic) fetchArticlesForTopic(topic)
    }
  }, [selection, fetchArticlesForKeyword, fetchArticlesForTopic])

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    const trimmed = sanitizeKeyword(inputValue)
    if (!isValidKeyword(trimmed) || !isSignedIn) return
    setIsSubmitting(true)
    try {
      const newKw = await api.addKeyword(trimmed)
      setKeywords(prev => [newKw, ...prev])
      setSelection({ type: 'keyword', id: newKw.id })
      setInputValue('')
      toast.success(`Now tracking "${trimmed}"`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
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
    const wasSelected = selection?.type === 'keyword' && selection.id === kw.id

    setKeywords(prev => prev.filter(k => k.id !== kw.id))
    if (wasSelected) {
      const remaining = previous.filter(k => k.id !== kw.id)
      if (remaining.length > 0) setSelection({ type: 'keyword', id: remaining[0].id })
      else { setSelection(null); setArticles([]) }
    }

    try {
      await api.deleteKeyword(kw.id)
      toast.success('Keyword removed')
    } catch {
      setKeywords(previous)
      toast.error('Failed to remove keyword')
    }
  }

  const handleDeleteTopic = async (topic: KeywordTopic) => {
    const wasSelected = selection?.type === 'topic' && selection.id === topic.id
    setTopics(prev => prev.filter(t => t.id !== topic.id))
    if (wasSelected) { setSelection(null); setArticles([]) }
    try {
      await api.deleteTopic(topic.id)
    } catch {
      setTopics(prev => [...prev, topic].sort((a, b) => a.name.localeCompare(b.name)))
      toast.error('Failed to delete feed')
    }
  }

  const handleCreateTopic = async (name: string, keywordIds: string[]) => {
    const topic = await api.createTopic(name)
    await Promise.all(keywordIds.map(id => api.addKeywordToTopic(topic.id, id)))
    // Re-fetch topics to get membership
    const fresh = await api.getTopics()
    setTopics(fresh)
    setSelection({ type: 'topic', id: topic.id })
    toast.success(`Feed "${name}" created`)
  }

  const handleSaveAlert = async (email: string, frequency: 'hourly' | 'daily') => {
    if (!alertModalKw) return
    const setting = await api.upsertAlertSetting(alertModalKw.id, email, frequency, true)
    setAlertSettings(prev => {
      const filtered = prev.filter(s => s.keyword_id !== alertModalKw.id)
      return [...filtered, setting]
    })
    toast.success(`Alerts enabled for "${alertModalKw.keyword}"`)
  }

  const handleDisableAlert = async () => {
    if (!alertModalKw) return
    const existing = alertSettings.find(s => s.keyword_id === alertModalKw.id)
    if (!existing) return
    await api.deleteAlertSetting(existing.id)
    setAlertSettings(prev => prev.filter(s => s.id !== existing.id))
    toast.success('Alert disabled')
  }

  const handleThresholdChange = async (kw: Keyword, value: number) => {
    const rounded = Math.round(value * 100) / 100
    setKeywords(prev => prev.map(k => k.id === kw.id ? { ...k, threshold: rounded } : k))
    await api.updateKeywordThreshold(kw.id, rounded).catch(() => {})
    // Re-fetch with new threshold if this keyword is selected
    if (selection?.type === 'keyword' && selection.id === kw.id) {
      fetchArticlesForKeyword({ ...kw, threshold: rounded })
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const regionLabel = REGION_OPTIONS.find(r => r.value === region)?.label ?? 'Global'
  const selectedKeyword = selection?.type === 'keyword' ? keywords.find(k => k.id === selection.id) : null
  const selectedTopic = selection?.type === 'topic' ? topics.find(t => t.id === selection.id) : null
  const selectionLabel = selectedKeyword?.keyword ?? selectedTopic?.name ?? null
  const selectionThreshold = selectedKeyword?.threshold ?? threshold

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Keywords and Media Monitoring</h1>
            <p className="text-sm text-stone-500 dark:text-slate-400">
              {isLoaded && isSignedIn
                ? `${keywords.length} keyword${keywords.length !== 1 ? 's' : ''} · ${topics.length} feed${topics.length !== 1 ? 's' : ''}`
                : 'Sign in to save and track keywords'}
            </p>
          </div>
        </div>
      </header>

      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3 w-64">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-full skeleton-shimmer" />)}
          </div>
        </div>
      )}

      {isLoaded && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* ── Left sidebar ──────────────────────────────────────────────── */}
          <aside className="w-full lg:w-72 flex-shrink-0 bg-white dark:bg-slate-800 border-b lg:border-b-0 lg:border-r border-stone-200 dark:border-slate-700 flex flex-col">

            {/* Input section */}
            <div className="p-3 lg:p-4 border-b border-stone-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-2 lg:mb-3 hidden lg:block">
                Add Keyword or Search
              </p>

              {/* Boolean query builder toggle */}
              {isSignedIn && (
                <button
                  onClick={() => setShowBoolBuilder(prev => !prev)}
                  className={`mb-2 flex items-center gap-1.5 text-xs font-medium transition-colors ${showBoolBuilder ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400 dark:text-slate-500 hover:text-stone-600'}`}
                >
                  <Code2 className="w-3 h-3" />
                  {showBoolBuilder ? 'Boolean query mode' : 'Use boolean query builder'}
                </button>
              )}

              {showBoolBuilder && isSignedIn ? (
                <BooleanQueryBuilder
                  onQueryChange={query => {
                    setBoolQuery(query)
                    setInputValue(query)
                  }}
                />
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                    <Input
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                      placeholder={isSignedIn ? 'e.g., climate change, AI…' : 'Sign in to search…'}
                      className="pl-8 h-9 rounded-lg border-stone-200 dark:border-slate-600 dark:bg-slate-700 dark:text-stone-100 dark:placeholder:text-slate-500 text-sm disabled:opacity-40"
                      maxLength={60}
                      disabled={!isSignedIn || isSubmitting}
                    />
                  </div>
                  <Button
                    onClick={handleAdd}
                    disabled={!isSignedIn || isSubmitting || !inputValue.trim()}
                    size="icon"
                    className="h-9 w-9 bg-slate-900 hover:bg-slate-800 rounded-lg flex-shrink-0 disabled:opacity-40"
                    title={isSignedIn ? 'Add keyword' : 'Sign in to add keywords'}
                  >
                    {isSignedIn ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </Button>
                </div>
              )}

              {isSignedIn ? (
                <p className="text-xs text-stone-400 dark:text-slate-500 mt-2 hidden lg:block">
                  {showBoolBuilder ? 'Build a precise query, then add as a keyword.' : 'Press Enter to add. Supports boolean: AND, OR, NOT'}
                </p>
              ) : (
                <Link to="/sign-in" className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors">
                  <LogIn className="w-3 h-3" /> Sign in to save keywords
                </Link>
              )}
            </div>

            {/* Monitor settings */}
            {isSignedIn && (
              <div className="p-3 lg:p-4 border-b border-stone-100 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-stone-400 dark:text-slate-500 uppercase tracking-wide hidden lg:block">Monitor Settings</p>
                  <button
                    onClick={() => setShowThreshold(prev => !prev)}
                    className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <ChevronDown className={`w-3 h-3 transition-transform ${showThreshold ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Region focus */}
                <div className="space-y-1.5">
                  <label className="text-xs text-stone-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Globe className="w-3 h-3" /> Region Focus
                  </label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="h-8 text-xs border-stone-200 dark:border-slate-600 dark:bg-slate-700 dark:text-stone-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Strict mode */}
                <button
                  onClick={() => setStrictMode(prev => !prev)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${strictMode
                    ? 'bg-slate-900 text-white dark:bg-slate-600'
                    : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <CrosshairIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 text-left">Headline Match Only</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${strictMode ? 'bg-white/20 text-white' : 'bg-stone-200 dark:bg-slate-600 text-stone-500'}`}>
                    {strictMode ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Threshold slider (collapsible) */}
                {showThreshold && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-stone-500 dark:text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-3 h-3" /> Relevance threshold</span>
                      <span className="font-mono">{(selectionThreshold * 100).toFixed(0)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={0.5}
                      step={0.01}
                      value={selectionThreshold}
                      onChange={e => {
                        const val = parseFloat(e.target.value)
                        setThreshold(val)
                        if (selectedKeyword) handleThresholdChange(selectedKeyword, val)
                      }}
                      className="w-full h-1.5 accent-slate-900 dark:accent-slate-400"
                    />
                    <div className="flex justify-between text-[9px] text-stone-300 dark:text-slate-600">
                      <span>Broad</span><span>Precise</span>
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-stone-400 dark:text-slate-500 leading-tight hidden lg:block">
                  {strictMode ? 'Only showing articles with keyword in the headline — highest precision.' : 'Showing all matching articles ranked by relevance.'}
                </p>
              </div>
            )}

            {/* Keyword + topic list */}
            <div className="lg:flex-1">
              <ScrollArea className="h-full">
                <div className="p-3 lg:p-4 space-y-4">
                  {!isSignedIn ? (
                    <div className="flex flex-col items-center justify-center py-4 lg:py-10 text-center">
                      <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-slate-700 flex items-center justify-center mb-3 hidden lg:flex">
                        <Lock className="w-5 h-5 text-stone-400 dark:text-slate-500" />
                      </div>
                      <p className="text-sm text-stone-500 dark:text-slate-400 font-medium mb-1">Sign in to get started</p>
                      <p className="text-xs text-stone-400 dark:text-slate-500 mb-4 hidden lg:block">Save keywords and track custom news feeds.</p>
                      <Link to="/sign-in">
                        <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white gap-2 h-8 text-xs">
                          <LogIn className="w-3.5 h-3.5" /> Sign In
                        </Button>
                      </Link>
                    </div>
                  ) : isLoadingKeywords ? (
                    <div className="flex flex-nowrap lg:flex-wrap gap-2">
                      {[...Array(5)].map((_, i) => <div key={i} className="h-8 w-20 rounded-full skeleton-shimmer flex-shrink-0" />)}
                    </div>
                  ) : (
                    <>
                      {/* Topics section */}
                      {topics.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Layers className="w-3 h-3" /> Feeds
                          </p>
                          <div className="flex flex-nowrap lg:flex-wrap gap-2 overflow-x-auto lg:overflow-visible pb-1">
                            {topics.map(topic => {
                              const isSelected = selection?.type === 'topic' && selection.id === topic.id
                              const memberCount = (topic.keyword_topic_members as { keyword_id: string }[] | undefined)?.length ?? 0
                              return (
                                <div key={topic.id} className="relative group/topic flex-shrink-0 lg:flex-shrink">
                                  <button
                                    onClick={() => setSelection({ type: 'topic', id: topic.id })}
                                    className={`inline-flex items-center gap-1.5 pl-2.5 pr-7 py-1.5 rounded-full text-sm font-medium transition-colors ${isSelected
                                      ? 'bg-slate-900 text-white dark:bg-slate-700'
                                      : 'bg-stone-100 dark:bg-slate-700 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-600'
                                    }`}
                                  >
                                    {isSelected ? <FolderOpen className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
                                    {topic.name}
                                    <span className="text-[10px] opacity-60">{memberCount}</span>
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleDeleteTopic(topic) }}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 opacity-0 group-hover/topic:opacity-100 hover:bg-red-100 text-stone-400 hover:text-red-600 transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Keywords section */}
                      <div>
                        {topics.length > 0 && (
                          <p className="text-[10px] font-semibold text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Tag className="w-3 h-3" /> Keywords
                          </p>
                        )}
                        {keywords.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-4 lg:py-8 text-center">
                            <Tag className="w-6 h-6 text-stone-300 dark:text-slate-600 mx-auto mb-2" />
                            <p className="text-xs text-stone-400 dark:text-slate-500">No keywords yet.</p>
                            <p className="text-xs text-stone-300 dark:text-slate-600 mt-1 hidden lg:block">Add one above to create your first feed.</p>
                          </div>
                        ) : (
                          <div className="flex flex-nowrap lg:flex-wrap gap-2 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0">
                            {keywords.map(kw => {
                              const isSelected = selection?.type === 'keyword' && selection.id === kw.id
                              const hasAlert = alertSettings.some(s => s.keyword_id === kw.id && s.enabled)
                              const count = articleCounts[kw.id]
                              return (
                                <div key={kw.id} className="relative group/kw flex-shrink-0 lg:flex-shrink">
                                  <span
                                    onClick={() => setSelection({ type: 'keyword', id: kw.id })}
                                    className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm font-medium cursor-pointer select-none transition-colors ${isSelected
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-stone-100 dark:bg-slate-700 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-600'
                                    }`}
                                  >
                                    {kw.keyword}
                                    {/* Article count badge */}
                                    {count !== undefined && (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isSelected
                                        ? 'bg-white/20 text-white'
                                        : 'bg-stone-200 dark:bg-slate-600 text-stone-500 dark:text-slate-400'
                                      }`}>{count}</span>
                                    )}
                                    {/* Alert indicator */}
                                    {hasAlert && (
                                      <Bell className={`w-2.5 h-2.5 flex-shrink-0 ${isSelected ? 'text-white/70' : 'text-blue-500'}`} />
                                    )}
                                    {/* Alert button */}
                                    <button
                                      onClick={e => { e.stopPropagation(); setAlertModalKw(kw) }}
                                      className={`rounded-full p-0.5 transition-colors flex-shrink-0 opacity-0 group-hover/kw:opacity-100 ${isSelected ? 'hover:bg-white/20 text-slate-300 hover:text-white' : 'hover:bg-stone-300 text-stone-400 hover:text-stone-600'}`}
                                      aria-label={`Alert settings for ${kw.keyword}`}
                                      title="Email alerts"
                                    >
                                      <Bell className="w-3 h-3" />
                                    </button>
                                    {/* Delete button */}
                                    <button
                                      onClick={e => { e.stopPropagation(); handleDelete(kw) }}
                                      className={`rounded-full p-0.5 transition-colors flex-shrink-0 ${isSelected
                                        ? 'hover:bg-white/20 text-slate-300 hover:text-white'
                                        : 'hover:bg-stone-300 text-stone-400 hover:text-stone-600'
                                      }`}
                                      aria-label={`Remove ${kw.keyword}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Create topic button */}
                      {keywords.length >= 2 && (
                        <button
                          onClick={() => setShowCreateTopic(true)}
                          className="flex items-center gap-1.5 text-xs text-stone-400 dark:text-slate-500 hover:text-stone-600 dark:hover:text-slate-300 transition-colors"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          Create feed from keywords
                        </button>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          </aside>

          {/* ── Main feed ─────────────────────────────────────────────────── */}
          <div className="flex-1 min-h-0 flex flex-col">
            {!selection ? (
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
                      <LogIn className="w-4 h-4" /> Sign In
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <>
                {/* Feed header */}
                <div className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-6 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
                  {selectedTopic ? <Folder className="w-4 h-4 text-stone-400 dark:text-slate-500" /> : <Tag className="w-4 h-4 text-stone-400 dark:text-slate-500" />}
                  <span className="font-semibold text-stone-900 dark:text-stone-100 capitalize">{selectionLabel}</span>

                  {/* Active filter badges */}
                  <div className="flex items-center gap-1.5">
                    {region !== 'world' && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{regionLabel}</span>
                    )}
                    {strictMode && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Headlines</span>
                    )}
                    {selectedKeyword && (selectedKeyword.threshold ?? threshold) !== 0.12 && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                        Threshold {((selectedKeyword.threshold ?? threshold) * 100).toFixed(0)}%
                      </span>
                    )}
                    {selectedTopic && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        Combined feed
                      </span>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    {/* Alert button (keyword only) */}
                    {selectedKeyword && (
                      <button
                        onClick={() => setAlertModalKw(selectedKeyword)}
                        className={`p-1.5 rounded-lg transition-colors ${alertSettings.some(s => s.keyword_id === selectedKeyword.id && s.enabled)
                          ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-slate-700'
                        }`}
                        title="Email alert settings"
                      >
                        <Bell className="w-4 h-4" />
                      </button>
                    )}
                    {/* Timeframe */}
                    <div className="flex items-center gap-1">
                      {(['24h', '3d', 'week'] as const).map(range => (
                        <button
                          key={range}
                          onClick={() => setDateRange(range)}
                          className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${dateRange === range
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
                      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                        <Newspaper className="w-10 h-10 text-stone-300 dark:text-slate-600 mb-4" />
                        <h3 className="text-lg font-semibold text-stone-700 dark:text-slate-300 mb-1">No articles found</h3>
                        <p className="text-stone-400 dark:text-slate-500 text-sm max-w-xs">
                          No recent articles matched "{selectionLabel}"
                          {region !== 'world' ? ` in ${regionLabel}` : ''}
                          {strictMode ? ' (headline match)' : ''}.
                          {strictMode ? ' Try turning off "Headline Match Only" for broader results.' : ' Try a broader term or check back later.'}
                        </p>
                      </div>
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

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {alertModalKw && (
        <AlertModal
          keyword={alertModalKw}
          existing={alertSettings.find(s => s.keyword_id === alertModalKw.id)}
          onSave={handleSaveAlert}
          onDisable={handleDisableAlert}
          onClose={() => setAlertModalKw(null)}
        />
      )}

      {showCreateTopic && (
        <CreateTopicModal
          keywords={keywords}
          onClose={() => setShowCreateTopic(false)}
          onCreate={handleCreateTopic}
        />
      )}
    </div>
  )
}
