import React, { useContext, useState, useEffect, useCallback, useRef } from 'react'
import SEO from '@/components/SEO'
import {
  Tag, Plus, X, Lock, Newspaper, Search, LogIn, Globe, CrosshairIcon,
  Bell, BellOff, Layers, FolderPlus,
  Folder, FolderOpen, Trash2, Code2, BarChart2, Zap, TrendingUp, TrendingDown, Minus, RefreshCw, Sparkles
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
import type { Article, Keyword, KeywordTopic, KeywordAlertSetting, SearchAnalyticsEntry, GoogleTrendsData, KeywordSentimentData } from '@/types/article'
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
  REGION: 'kw-region',
  STRICT: 'kw-strict',
  BOOL_MODE: 'kw-bool-mode',
}

const DEFAULT_THRESHOLD = 0.12

const load = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}
const save = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { }
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

function groupByDay(entries: SearchAnalyticsEntry[]): { date: string; count: number }[] {
  const map: Record<string, number> = {}
  for (const e of entries) {
    const day = e.created_at.slice(0, 10)
    map[day] = (map[day] ?? 0) + 1
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
}

function expansionBreakdown(entries: SearchAnalyticsEntry[]): { source: string; count: number; pct: number }[] {
  const map: Record<string, number> = {}
  for (const e of entries) {
    const s = e.expansion_source ?? 'unknown'
    map[s] = (map[s] ?? 0) + 1
  }
  const total = entries.length || 1
  return Object.entries(map)
    .map(([source, count]) => ({ source, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
}

const EXPANSION_LABELS: Record<string, { label: string; colour: string }> = {
  static: { label: 'Static map', colour: 'bg-blue-500' },
  llm: { label: 'AI-expanded', colour: 'bg-purple-500' },
  boolean: { label: 'Boolean query', colour: 'bg-green-500' },
  raw: { label: 'Raw keyword', colour: 'bg-amber-500' },
  unknown: { label: 'Unknown', colour: 'bg-stone-400' },
}

function computeVelocity(entries: SearchAnalyticsEntry[], days: number): { direction: 'rising' | 'falling' | 'stable'; changePct: number } {
  if (entries.length < 2) return { direction: 'stable', changePct: 0 }
  const mid = new Date(Date.now() - (days / 2) * 86400000).toISOString()
  const first = entries.filter(e => e.created_at < mid)
  const second = entries.filter(e => e.created_at >= mid)
  const avg = (arr: SearchAnalyticsEntry[]) =>
    arr.reduce((s, e) => s + (e.result_count ?? 0), 0) / (arr.length || 1)
  const avgFirst = avg(first)
  const avgSecond = avg(second)
  const changePct = avgFirst === 0 ? 0 : Math.round(((avgSecond - avgFirst) / avgFirst) * 100)
  const direction = changePct > 5 ? 'rising' : changePct < -5 ? 'falling' : 'stable'
  return { direction, changePct }
}

function aggregateSourcesAndGeo(entries: SearchAnalyticsEntry[]): {
  sources: [string, number][]
  countries: [string, number][]
} {
  const sources: Record<string, number> = {}
  const countries: Record<string, number> = {}
  for (const e of entries) {
    if (e.top_sources) {
      for (const [s, c] of Object.entries(e.top_sources)) sources[s] = (sources[s] ?? 0) + c
    }
    if (e.top_countries) {
      for (const [c, n] of Object.entries(e.top_countries)) countries[c] = (countries[c] ?? 0) + n
    }
  }
  const sort = (obj: Record<string, number>): [string, number][] =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 6)
  return { sources: sort(sources), countries: sort(countries) }
}

function countryCodeToFlag(code: string): string {
  const upper = code.toUpperCase()
  if (upper.length !== 2) return '🌐'
  return String.fromCodePoint(...[...upper].map(c => c.charCodeAt(0) + 0x1f1a5))
}

// (Per-keyword AlertModal removed — alerts are now feed-only)

// ─── Topic modal ──────────────────────────────────────────────────────────────

interface TopicModalProps {
  keywords: Keyword[]
  userEmail: string | null
  onClose: () => void
  onCreate: (name: string, keywordIds: string[], enableDigest: boolean) => Promise<void>
}

function CreateTopicModal({ keywords, userEmail, onClose, onCreate }: TopicModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [enableDigest, setEnableDigest] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!name.trim()) { toast.error('Enter a feed name'); return }
    if (selected.size === 0) { toast.error('Select at least one keyword'); return }
    setSaving(true)
    try { await onCreate(name.trim(), [...selected], enableDigest); onClose() } catch { toast.error('Failed to create feed') } finally { setSaving(false) }
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
          {userEmail && (
            <button
              type="button"
              onClick={() => setEnableDigest(prev => !prev)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${enableDigest
                ? 'bg-blue-600 text-white'
                : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-600'
                }`}
            >
              <Bell className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">Add to daily email digest</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${enableDigest ? 'bg-white/20 text-white' : 'bg-stone-200 dark:bg-slate-600 text-stone-500'}`}>
                {enableDigest ? 'ON' : 'OFF'}
              </span>
            </button>
          )}
          {enableDigest && userEmail && (
            <p className="text-[10px] text-stone-400 dark:text-slate-500 -mt-2">
              Digest will be sent to {userEmail}
            </p>
          )}
          <Button onClick={handleCreate} disabled={saving} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
            {saving ? 'Creating…' : 'Create feed'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Topic alert modal ─────────────────────────────────────────────────────────

interface TopicAlertModalProps {
  topic: KeywordTopic
  existing: KeywordAlertSetting | undefined
  onSave: (email: string) => Promise<void>
  onDisable: () => Promise<void>
  onClose: () => void
}

function TopicAlertModal({ topic, existing, onSave, onDisable, onClose }: TopicAlertModalProps) {
  const [saving, setSaving] = useState(false)

  async function handleEnable() {
    setSaving(true)
    try { await onSave(existing?.email ?? ''); onClose() } finally { setSaving(false) }
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
            Daily Digest — <em className="not-italic font-semibold">{topic.name}</em>
          </DialogTitle>
          <DialogDescription>
            {existing?.enabled
              ? 'Daily digest is active for this feed.'
              : 'Enable a daily email digest for this feed.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {existing?.email && (
            <p className="text-xs text-stone-500 dark:text-slate-400">
              Sending to: <span className="font-medium text-stone-700 dark:text-slate-200">{existing.email}</span>
            </p>
          )}
          <div className="flex gap-2">
            {!existing?.enabled ? (
              <Button onClick={handleEnable} disabled={saving} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white">
                {saving ? 'Enabling…' : 'Enable digest'}
              </Button>
            ) : (
              <Button onClick={handleDisable} disabled={saving} variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50 gap-2">
                <BellOff className="w-4 h-4" />
                {saving ? 'Disabling…' : 'Disable digest'}
              </Button>
            )}
          </div>
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
  const [dateRange, setDateRange] = useState<'24h' | '3d' | 'week' | 'month'>('24h')
  const [region, setRegion] = useState<string>(() => load(LS.REGION, 'world'))
  const [strictMode, setStrictMode] = useState<boolean>(() => load(LS.STRICT, false))
  const [showBoolBuilder, setShowBoolBuilder] = useState<boolean>(() => load(LS.BOOL_MODE, false))
  const [boolQuery, setBoolQuery] = useState('')

  // ── UI state ──
  const [alertModalTopic, setAlertModalTopic] = useState<KeywordTopic | null>(null)
  const [showCreateTopic, setShowCreateTopic] = useState(false)

  // ── Analytics tab ──
  const [activeView, setActiveView] = useState<'articles' | 'analytics'>('articles')
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30)
  const [analyticsEntries, setAnalyticsEntries] = useState<SearchAnalyticsEntry[]>([])
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false)
  const [googleTrends, setGoogleTrends] = useState<GoogleTrendsData | null>(null)
  const [isLoadingTrends, setIsLoadingTrends] = useState(false)
  const [sentimentData, setSentimentData] = useState<KeywordSentimentData | null>(null)
  const [isLoadingSentiment, setIsLoadingSentiment] = useState(false)
  const [compareKeywords, setCompareKeywords] = useState<string[]>([])
  const [compareData, setCompareData] = useState<Record<string, { date: string; count: number }[]>>({})
  const [isLoadingCompare, setIsLoadingCompare] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // Persist preferences
  useEffect(() => { save(LS.REGION, region) }, [region])
  useEffect(() => { save(LS.STRICT, strictMode) }, [strictMode])
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

  const fetchArticlesForKeyword = useCallback(async (kw: Keyword, forceRefresh: boolean = false) => {
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
        threshold: kw.threshold ?? DEFAULT_THRESHOLD,
        forceRefresh,
      })
      if (ctrl.signal.aborted) return
      const arts = result?.articles ?? []
      setArticles(arts)
      // Update local count + persist to DB (fire-and-forget)
      setArticleCounts(prev => ({ ...prev, [kw.id]: arts.length }))
      api.updateKeywordArticleCount(kw.id, arts.length).catch(() => { })
    } catch (err) {
      if (ctrl.signal.aborted) return
      toast.error(`Failed to fetch articles for "${kw.keyword}"`)
      setArticles([])
    } finally {
      if (!ctrl.signal.aborted) setIsLoadingArticles(false)
    }
  }, [dateRange, region, strictMode, showBoolBuilder, boolQuery])

  const fetchArticlesForTopic = useCallback(async (topic: KeywordTopic, forceRefresh: boolean = false) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Get the keyword IDs belonging to this topic
    const memberIds = topic.keyword_topic_members?.map(m => m.keyword_id) ?? []
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
        threshold: DEFAULT_THRESHOLD,
        forceRefresh,
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
  }, [keywords, dateRange, region, strictMode])

  // Trigger fetch whenever selection or filters change
  useEffect(() => {
    if (!selection) return
    if (selection.type === 'keyword') {
      const kw = keywords.find(k => k.id === selection.id)
      if (kw) fetchArticlesForKeyword(kw, false)
    } else {
      const topic = topics.find(t => t.id === selection.id)
      if (topic) fetchArticlesForTopic(topic, false)
    }
  }, [selection, fetchArticlesForKeyword, fetchArticlesForTopic])

  // Reset to articles view and clear comparison state when selection changes
  useEffect(() => {
    setActiveView('articles')
    setCompareKeywords([])
    setGoogleTrends(null)
    setSentimentData(null)
  }, [selection])

  // Load analytics when the analytics tab is active
  useEffect(() => {
    if (activeView !== 'analytics' || !selection || !isSignedIn) return
    const kwNames: string[] = selection.type === 'keyword'
      ? [keywords.find(k => k.id === selection.id)?.keyword].filter(Boolean) as string[]
      : (topics.find(t => t.id === selection.id)?.keyword_topic_members ?? [])
        .map(m => keywords.find(k => k.id === m.keyword_id)?.keyword)
        .filter(Boolean) as string[]
    if (!kwNames.length) return
    setIsLoadingAnalytics(true)
    api.getSearchAnalytics(analyticsDays, kwNames.length === 1 ? kwNames[0] : kwNames)
      .then(setAnalyticsEntries)
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setIsLoadingAnalytics(false))
  }, [activeView, analyticsDays, selection, isSignedIn, keywords, topics])

  // Load Google Trends for single-keyword selections
  useEffect(() => {
    if (activeView !== 'analytics' || !selection || selection.type !== 'keyword' || !isSignedIn) {
      setGoogleTrends(null)
      setIsLoadingTrends(false)
      return
    }
    const kwName = keywords.find(k => k.id === selection.id)?.keyword
    if (!kwName) return
    setIsLoadingTrends(true)
    setGoogleTrends(null)
    api.getGoogleTrends(kwName, analyticsDays)
      .then(setGoogleTrends)
      .catch(() => setGoogleTrends(null)) // silently fail — optional feature
      .finally(() => setIsLoadingTrends(false))
  }, [activeView, selection, analyticsDays, isSignedIn, keywords])

  // Load AI sentiment summary for single-keyword selections
  useEffect(() => {
    if (activeView !== 'analytics' || !selection || selection.type !== 'keyword' || !isSignedIn) {
      setSentimentData(null)
      setIsLoadingSentiment(false)
      return
    }
    const kwName = keywords.find(k => k.id === selection.id)?.keyword
    if (!kwName) return
    setIsLoadingSentiment(true)
    setSentimentData(null)
    api.getKeywordSentiment(kwName, analyticsDays as 7 | 30 | 90)
      .then(setSentimentData)
      .catch(() => setSentimentData(null)) // silently fail — optional feature
      .finally(() => setIsLoadingSentiment(false))
  }, [activeView, selection, analyticsDays, isSignedIn, keywords])

  // Load comparison keyword analytics
  useEffect(() => {
    if (compareKeywords.length === 0 || activeView !== 'analytics') {
      setCompareData({})
      return
    }
    setIsLoadingCompare(true)
    Promise.all(
      compareKeywords.map(kw =>
        api.getSearchAnalytics(analyticsDays, kw).then(entries => ({ kw, data: groupByDay(entries) }))
      )
    )
      .then(results => {
        const map: Record<string, { date: string; count: number }[]> = {}
        for (const { kw, data } of results) map[kw] = data
        setCompareData(map)
      })
      .catch(() => toast.error('Failed to load comparison data'))
      .finally(() => setIsLoadingCompare(false))
  }, [compareKeywords, analyticsDays, activeView])

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

  const handleCreateTopic = async (name: string, keywordIds: string[], enableDigest: boolean) => {
    const topic = await api.createTopic(name)
    await Promise.all(keywordIds.map(id => api.addKeywordToTopic(topic.id, id)))
    const fresh = await api.getTopics()
    const members = keywordIds.map(id => ({ keyword_id: id }))
    setTopics(fresh.map(t =>
      t.id === topic.id ? { ...t, keyword_topic_members: members } : t
    ))
    setSelection({ type: 'topic', id: topic.id })
    // Save email alert if digest toggle was on
    if (enableDigest && user?.primaryEmailAddress?.emailAddress) {
      const setting = await api.upsertTopicAlertSetting(topic.id, user.primaryEmailAddress.emailAddress, 'daily', true)
      setAlertSettings(prev => [...prev, setting])
    }
    toast.success(`Feed "${name}" created${enableDigest ? ' with daily digest' : ''}`)
  }

  // (Per-keyword alert handlers removed — alerts are feed-only now)

  const handleSaveTopicAlert = async (email: string) => {
    if (!alertModalTopic) return
    const setting = await api.upsertTopicAlertSetting(alertModalTopic.id, email, 'daily', true)
    setAlertSettings(prev => {
      const filtered = prev.filter(s => s.topic_id !== alertModalTopic.id)
      return [...filtered, setting]
    })
    toast.success(`Alerts enabled for feed "${alertModalTopic.name}"`)
  }

  const handleDisableTopicAlert = async () => {
    if (!alertModalTopic) return
    const existing = alertSettings.find(s => s.topic_id === alertModalTopic.id)
    if (!existing) return
    await api.deleteAlertSetting(existing.id)
    setAlertSettings(prev => prev.filter(s => s.id !== existing.id))
    toast.success('Feed alert disabled')
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const regionLabel = REGION_OPTIONS.find(r => r.value === region)?.label ?? 'Global'
  const selectedKeyword = selection?.type === 'keyword' ? keywords.find(k => k.id === selection.id) : null
  const selectedTopic = selection?.type === 'topic' ? topics.find(t => t.id === selection.id) : null
  const selectionLabel = selectedKeyword?.keyword ?? selectedTopic?.name ?? null

  const analyticsDaily = groupByDay(analyticsEntries)
  const analyticsBreakdown = expansionBreakdown(analyticsEntries)
  const analyticsMaxDay = Math.max(...analyticsDaily.map(d => d.count), 1)
  const analyticsAvgResults = analyticsEntries.length
    ? Math.round(analyticsEntries.reduce((s, e) => s + (e.result_count ?? 0), 0) / analyticsEntries.length)
    : 0
  const velocity = computeVelocity(analyticsEntries, analyticsDays)
  const analyticsSourceData = aggregateSourcesAndGeo(analyticsEntries)

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      <SEO
        title="News Keyword Monitoring"
        description="Monitor breaking news with keyword alerts. Search and track the topics that matter to you with short-form summaries."
        canonical="/keywords"
      />
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
                <p className="text-xs font-semibold text-stone-400 dark:text-slate-500 uppercase tracking-wide hidden lg:block">Monitor Settings</p>

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

                <p className="text-[10px] text-stone-400 dark:text-slate-500 leading-tight hidden lg:block">
                  {strictMode ? 'Only showing articles with keyword in the headline — highest precision.' : 'Showing all matching articles ranked by relevance.'}
                </p>
              </div>
            )}

            {/* Create feed from keywords — shown when ≥2 keywords exist */}
            {isSignedIn && keywords.length >= 2 && (
              <div className="px-3 lg:px-4 pb-2">
                <button
                  onClick={() => setShowCreateTopic(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-stone-300 dark:border-slate-600 text-xs font-medium text-stone-500 dark:text-slate-400 hover:border-stone-400 dark:hover:border-slate-500 hover:text-stone-700 dark:hover:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5 flex-shrink-0" />
                  Create feed from keywords
                </button>
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
                    <div className="flex flex-wrap gap-2">
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
                          <div className="flex flex-wrap gap-2 pb-1">
                            {topics.map(topic => {
                              const isSelected = selection?.type === 'topic' && selection.id === topic.id
                              const memberCount = topic.keyword_topic_members?.length ?? 0
                              const hasTopicAlert = alertSettings.some(s => s.topic_id === topic.id && s.enabled)
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
                                    {hasTopicAlert && (
                                      <Bell className={`w-2.5 h-2.5 flex-shrink-0 ${isSelected ? 'text-white/70' : 'text-blue-500'}`} />
                                    )}
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
                          <div className="flex flex-wrap gap-2 pb-1 lg:pb-0">
                            {keywords.map(kw => {
                              const isSelected = selection?.type === 'keyword' && selection.id === kw.id
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
                    {selectedTopic && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        Combined feed
                      </span>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    {/* Manual Refresh Button */}
                    <button
                      onClick={() => {
                        if (selection?.type === 'keyword') {
                          const kw = keywords.find(k => k.id === selection.id)
                          if (kw) fetchArticlesForKeyword(kw, true)
                        } else if (selection?.type === 'topic') {
                          const topic = topics.find(t => t.id === selection.id)
                          if (topic) fetchArticlesForTopic(topic, true)
                        }
                      }}
                      disabled={isLoadingArticles}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium"
                      title="Force refresh live articles"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingArticles ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </button>
                    {/* Alert button (topic/feed, articles view) */}
                    {selectedTopic && activeView === 'articles' && (
                      <button
                        onClick={() => setAlertModalTopic(selectedTopic)}
                        className={`p-1.5 rounded-lg transition-colors ${alertSettings.some(s => s.topic_id === selectedTopic.id && s.enabled)
                          ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-slate-700'
                          }`}
                        title="Feed email alert settings"
                      >
                        <Bell className="w-4 h-4" />
                      </button>
                    )}
                    {/* View tabs: Articles / Analytics */}
                    <div className="flex items-center gap-0.5 bg-stone-100 dark:bg-slate-700 rounded-lg p-0.5">
                      {(['articles', 'analytics'] as const).map(view => (
                        <button
                          key={view}
                          onClick={() => setActiveView(view)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${activeView === view
                            ? 'bg-white dark:bg-slate-600 text-stone-900 dark:text-stone-100 shadow-sm'
                            : 'text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200'
                            }`}
                        >
                          {view === 'articles' ? <Newspaper className="w-3 h-3" /> : <BarChart2 className="w-3 h-3" />}
                          {view === 'articles' ? 'Articles' : 'Analytics'}
                        </button>
                      ))}
                    </div>
                    {/* Timeframe (articles view only) */}
                    {activeView === 'articles' && (
                      <div className="flex items-center gap-1">
                        {(['24h', '3d', 'week', 'month'] as const).map(range => (
                          <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${dateRange === range
                              ? 'bg-slate-900 text-white'
                              : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-600'
                              }`}
                          >
                            {range === '24h' ? '24h' : range === '3d' ? '3 days' : range === 'week' ? '1 week' : '1 month'}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Analytics days selector (analytics view only) */}
                    {activeView === 'analytics' && (
                      <div className="flex items-center gap-1">
                        {([7, 30, 90] as const).map(d => (
                          <button
                            key={d}
                            onClick={() => setAnalyticsDays(d)}
                            className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${analyticsDays === d
                              ? 'bg-slate-900 text-white'
                              : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-600'
                              }`}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    )}
                    {activeView === 'articles' && !isLoadingArticles && (
                      <span className="text-xs text-stone-400 dark:text-slate-500">
                        {articles.length} article{articles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {activeView === 'articles' && (
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
                )}

                {activeView === 'analytics' && (
                  <ScrollArea className="flex-1">
                    <div className="p-4 lg:p-6">
                      {isLoadingAnalytics ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl skeleton-shimmer" />)}
                        </div>
                      ) : analyticsEntries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                          <BarChart2 className="w-10 h-10 text-stone-300 dark:text-slate-600 mb-4" />
                          <h3 className="text-lg font-semibold text-stone-700 dark:text-slate-300 mb-1">No search history yet</h3>
                          <p className="text-stone-400 dark:text-slate-500 text-sm max-w-xs">
                            Search history for "{selectionLabel}" will appear here after you view articles.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6 max-w-5xl">

                          {/* ── Trend Overview ─────────────────────────────── */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Google Search Trend */}
                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                              <div className="flex items-center justify-between mb-3">
                                <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">Google Search Trend</h2>
                                {isLoadingTrends && <span className="text-[10px] text-stone-400 animate-pulse">Loading…</span>}
                                {!isLoadingTrends && googleTrends && (
                                  <span className={`flex items-center gap-1 text-xs font-medium ${googleTrends.direction === 'rising' ? 'text-green-600' : googleTrends.direction === 'falling' ? 'text-red-500' : 'text-stone-500'}`}>
                                    {googleTrends.direction === 'rising' ? <TrendingUp className="w-3.5 h-3.5" /> : googleTrends.direction === 'falling' ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                    {googleTrends.direction === 'stable' ? 'Stable' : `${googleTrends.direction === 'rising' ? '+' : ''}${googleTrends.changePct}%`}
                                  </span>
                                )}
                              </div>
                              {isLoadingTrends ? (
                                <div className="h-16 skeleton-shimmer rounded" />
                              ) : googleTrends && googleTrends.interest.length > 0 ? (
                                <>
                                  <div className="flex items-end gap-0.5 h-16">
                                    {googleTrends.interest.map(({ date, value }) => (
                                      <div
                                        key={date}
                                        className={`flex-1 rounded-t transition-opacity hover:opacity-100 opacity-80 ${googleTrends.direction === 'rising' ? 'bg-green-500' : googleTrends.direction === 'falling' ? 'bg-red-400' : 'bg-slate-400'}`}
                                        style={{ height: `${Math.max(value, 2)}%`, minHeight: 2 }}
                                        title={`${date}: ${value}/100`}
                                      />
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-stone-400 dark:text-slate-500 mt-2">
                                    Google search interest (0–100) · last {analyticsDays}d
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-stone-400 dark:text-slate-500">
                                  {selectedTopic
                                    ? 'Google Trends available for individual keywords only.'
                                    : 'No data — add a SERPAPI_KEY environment variable to enable.'}
                                </p>
                              )}
                            </div>

                            {/* News Coverage Velocity */}
                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                              <div className="flex items-center justify-between mb-3">
                                <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">News Coverage Trend</h2>
                                <span className={`flex items-center gap-1 text-xs font-medium ${velocity.direction === 'rising' ? 'text-green-600' : velocity.direction === 'falling' ? 'text-red-500' : 'text-stone-500'}`}>
                                  {velocity.direction === 'rising' ? <TrendingUp className="w-3.5 h-3.5" /> : velocity.direction === 'falling' ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                  {velocity.direction === 'stable' ? 'Stable' : `${velocity.direction === 'rising' ? '+' : ''}${velocity.changePct}%`}
                                </span>
                              </div>
                              <p className="text-xs text-stone-500 dark:text-slate-400">
                                Article volume is{' '}
                                <span className={`font-medium ${velocity.direction === 'rising' ? 'text-green-600' : velocity.direction === 'falling' ? 'text-red-500' : 'text-stone-700 dark:text-slate-300'}`}>
                                  {velocity.direction === 'rising' ? 'increasing' : velocity.direction === 'falling' ? 'decreasing' : 'stable'}
                                </span>{' '}
                                compared to the first half of this period.
                              </p>
                              <p className="text-[10px] text-stone-400 dark:text-slate-500 mt-3">
                                Based on avg articles per search · last {analyticsDays}d
                              </p>
                            </div>
                          </div>

                          {/* ── Breakout Queries ───────────────────────────── */}
                          {googleTrends && googleTrends.breakoutQueries.length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                              <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm mb-1 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500" />
                                Breakout Searches
                              </h2>
                              <p className="text-[11px] text-stone-500 dark:text-slate-400 mb-3">
                                Fast-rising Google searches related to "{selectionLabel}"
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {googleTrends.breakoutQueries.map(q => (
                                  <span key={q} className="px-3 py-1 text-xs rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    {q}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ── AI Sentiment Summary ───────────────────────── */}
                          {(isLoadingSentiment || sentimentData) && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                              <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm mb-3 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-purple-500" />
                                AI Sentiment Summary
                              </h2>
                              {isLoadingSentiment ? (
                                <div className="space-y-2">
                                  <div className="h-4 w-24 skeleton-shimmer rounded" />
                                  <div className="h-3 w-full skeleton-shimmer rounded" />
                                  <div className="h-3 w-4/5 skeleton-shimmer rounded" />
                                </div>
                              ) : sentimentData && (
                                <>
                                  <div className="flex items-center gap-3 mb-3">
                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                      sentimentData.sentiment === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                      sentimentData.sentiment === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                      sentimentData.sentiment === 'mixed'    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                                                               'bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-slate-300'
                                    }`}>
                                      {sentimentData.sentiment.charAt(0).toUpperCase() + sentimentData.sentiment.slice(1)}
                                    </span>
                                    <span className="text-[10px] text-stone-400 dark:text-slate-500">
                                      News: <span className="font-medium">{sentimentData.newsSentiment}</span>
                                      {sentimentData.socialSentiment && (
                                        <> · Reddit: <span className="font-medium">{sentimentData.socialSentiment}</span></>
                                      )}
                                    </span>
                                  </div>
                                  <p className="text-xs text-stone-600 dark:text-slate-300 leading-relaxed mb-3">
                                    {sentimentData.summary}
                                  </p>
                                  {sentimentData.themes.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                      {sentimentData.themes.map(t => (
                                        <span key={t} className="px-2.5 py-0.5 text-[11px] rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <p className="text-[10px] text-stone-400 dark:text-slate-500">
                                    Based on {sentimentData.newsCount} news article{sentimentData.newsCount !== 1 ? 's' : ''}
                                    {sentimentData.redditCount > 0 && ` · ${sentimentData.redditCount} Reddit post${sentimentData.redditCount !== 1 ? 's' : ''}`}
                                    {' '}· last {analyticsDays}d
                                  </p>
                                </>
                              )}
                            </div>
                          )}

                          {/* ── KPI row ────────────────────────────────────── */}
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                              { label: 'Total searches', value: analyticsEntries.length, icon: Search, colour: 'text-blue-600' },
                              { label: 'Avg results / search', value: analyticsAvgResults, icon: BarChart2, colour: 'text-purple-600' },
                              { label: 'AI-expanded queries', value: analyticsBreakdown.find(b => b.source === 'llm')?.count ?? 0, icon: Zap, colour: 'text-amber-600' },
                            ].map(({ label, value, icon: Icon, colour }) => (
                              <div key={label} className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-4">
                                <div className={`${colour} mb-2`}><Icon className="w-5 h-5" /></div>
                                <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{value.toLocaleString()}</div>
                                <div className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">{label}</div>
                              </div>
                            ))}
                          </div>

                          {/* ── Searches over time + expansion method ──────── */}
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                              <div className="flex items-center justify-between mb-4">
                                <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">Searches per day</h2>
                                {velocity.direction !== 'stable' && (
                                  <span className={`flex items-center gap-1 text-[11px] font-medium ${velocity.direction === 'rising' ? 'text-green-600' : 'text-red-500'}`}>
                                    {velocity.direction === 'rising' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {velocity.direction === 'rising' ? 'Trending up' : 'Trending down'}
                                  </span>
                                )}
                              </div>
                              {analyticsDaily.length === 0 ? (
                                <p className="text-xs text-stone-400">No data</p>
                              ) : (
                                <div className="flex items-end gap-1 h-32">
                                  {analyticsDaily.map(({ date, count }) => (
                                    <div key={date} className="flex flex-col items-center flex-1 min-w-0 gap-1 group">
                                      <div
                                        className="w-full rounded-t bg-slate-800 dark:bg-slate-400 transition-all group-hover:bg-blue-600 dark:group-hover:bg-blue-400"
                                        style={{ height: `${(count / analyticsMaxDay) * 100}%`, minHeight: 2 }}
                                        title={`${date}: ${count} search${count !== 1 ? 'es' : ''}`}
                                      />
                                      <span className="text-[8px] text-stone-400 rotate-45 origin-left hidden lg:block truncate w-6">
                                        {date.slice(5)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                              <h2 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 text-sm">Query expansion method</h2>
                              <div className="space-y-2.5">
                                {analyticsBreakdown.map(({ source, count, pct }) => {
                                  const meta = EXPANSION_LABELS[source] ?? { label: source, colour: 'bg-stone-400' }
                                  return (
                                    <div key={source}>
                                      <div className="flex justify-between text-xs mb-1">
                                        <span className="text-stone-600 dark:text-slate-400">{meta.label}</span>
                                        <span className="font-medium text-stone-800 dark:text-slate-300">{count} ({pct}%)</span>
                                      </div>
                                      <div className="h-1.5 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${meta.colour}`} style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>

                          {/* ── Source & Geographic Coverage ───────────────── */}
                          {(analyticsSourceData.sources.length > 0 || analyticsSourceData.countries.length > 0) && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {analyticsSourceData.sources.length > 0 && (
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                                  <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm mb-4 flex items-center gap-2">
                                    <Newspaper className="w-4 h-4 text-stone-400" />
                                    Top News Sources
                                  </h2>
                                  <div className="space-y-2.5">
                                    {analyticsSourceData.sources.map(([name, count]) => {
                                      const max = analyticsSourceData.sources[0]?.[1] ?? 1
                                      return (
                                        <div key={name}>
                                          <div className="flex justify-between text-xs mb-1">
                                            <span className="text-stone-700 dark:text-slate-300 truncate max-w-[65%]">{name}</span>
                                            <span className="font-medium text-stone-500 dark:text-slate-400">{count}</span>
                                          </div>
                                          <div className="h-1.5 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${(count / max) * 100}%` }} />
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              {analyticsSourceData.countries.length > 0 && (
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                                  <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm mb-4 flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-stone-400" />
                                    Geographic Coverage
                                  </h2>
                                  <div className="space-y-2">
                                    {analyticsSourceData.countries.map(([code, count]) => (
                                      <div key={code} className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-2">
                                          <span className="text-base leading-none">{countryCodeToFlag(code)}</span>
                                          <span className="text-stone-700 dark:text-slate-300 uppercase">{code}</span>
                                        </span>
                                        <span className="font-medium text-stone-500 dark:text-slate-400">{count} article{count !== 1 ? 's' : ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Keyword Comparison ─────────────────────────── */}
                          {!selectedTopic && keywords.length > 1 && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                              <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm mb-1">Keyword Comparison</h2>
                              <p className="text-[11px] text-stone-500 dark:text-slate-400 mb-3">
                                Select up to 2 other keywords to compare article volume.
                              </p>
                              <div className="flex flex-wrap gap-2 mb-4">
                                {keywords
                                  .filter(k => k.id !== selection?.id)
                                  .map(k => {
                                    const isSelected = compareKeywords.includes(k.keyword)
                                    const disabled = !isSelected && compareKeywords.length >= 2
                                    return (
                                      <button
                                        key={k.id}
                                        disabled={disabled}
                                        onClick={() => setCompareKeywords(prev =>
                                          isSelected ? prev.filter(x => x !== k.keyword) : prev.length < 2 ? [...prev, k.keyword] : prev
                                        )}
                                        className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${isSelected
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : disabled
                                            ? 'bg-stone-50 dark:bg-slate-700 text-stone-300 dark:text-slate-600 border-stone-200 dark:border-slate-600 cursor-not-allowed'
                                            : 'bg-stone-50 dark:bg-slate-700 text-stone-600 dark:text-slate-300 border-stone-200 dark:border-slate-600 hover:border-blue-400 hover:text-blue-600'
                                          }`}
                                      >
                                        {k.keyword}
                                      </button>
                                    )
                                  })}
                              </div>
                              {compareKeywords.length > 0 && (
                                isLoadingCompare ? (
                                  <div className="h-32 skeleton-shimmer rounded" />
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center gap-4 mb-3">
                                      <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-slate-400">
                                        <div className="w-3 h-3 rounded-sm bg-blue-600" />
                                        {selectionLabel}
                                      </div>
                                      {compareKeywords.map((kw, i) => (
                                        <div key={kw} className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-slate-400">
                                          <div className={`w-3 h-3 rounded-sm ${i === 0 ? 'bg-green-500' : 'bg-orange-500'}`} />
                                          {kw}
                                        </div>
                                      ))}
                                    </div>
                                    {(() => {
                                      const allDates = Array.from(new Set([
                                        ...analyticsDaily.map(d => d.date),
                                        ...compareKeywords.flatMap(kw => (compareData[kw] ?? []).map(d => d.date)),
                                      ])).sort()
                                      const primaryMap = Object.fromEntries(analyticsDaily.map(d => [d.date, d.count]))
                                      const compareMaps = compareKeywords.map(kw =>
                                        Object.fromEntries((compareData[kw] ?? []).map(d => [d.date, d.count]))
                                      )
                                      const maxVal = Math.max(
                                        ...allDates.map(d => Math.max(primaryMap[d] ?? 0, ...compareMaps.map(m => m[d] ?? 0))),
                                        1
                                      )
                                      return (
                                        <div className="flex items-end gap-1 h-32">
                                          {allDates.map(date => (
                                            <div key={date} className="flex items-end gap-0.5 flex-1 min-w-0">
                                              {[primaryMap[date] ?? 0, ...compareMaps.map(m => m[date] ?? 0)].map((val, i) => (
                                                <div
                                                  key={i}
                                                  className={`flex-1 rounded-t ${i === 0 ? 'bg-blue-600' : i === 1 ? 'bg-green-500' : 'bg-orange-500'}`}
                                                  style={{ height: `${(val / maxVal) * 100}%`, minHeight: val > 0 ? 2 : 0 }}
                                                  title={`${date} · ${i === 0 ? selectionLabel : compareKeywords[i - 1]}: ${val}`}
                                                />
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    })()}
                                  </>
                                )
                              )}
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {alertModalTopic && (
        <TopicAlertModal
          topic={alertModalTopic}
          existing={alertSettings.find(s => s.topic_id === alertModalTopic.id)}
          onSave={handleSaveTopicAlert}
          onDisable={handleDisableTopicAlert}
          onClose={() => setAlertModalTopic(null)}
        />
      )}

      {showCreateTopic && (
        <CreateTopicModal
          keywords={keywords}
          userEmail={user?.primaryEmailAddress?.emailAddress ?? null}
          onClose={() => setShowCreateTopic(false)}
          onCreate={handleCreateTopic}
        />
      )}
    </div>
  )
}
