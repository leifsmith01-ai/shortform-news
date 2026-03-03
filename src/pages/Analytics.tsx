import React, { useContext, useEffect, useState } from 'react'
import { BarChart2, TrendingUp, Search, Zap, Lock, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useUser } from '@clerk/clerk-react'
import { ApiReadyContext } from '@/App'
import api from '@/api'
import { toast } from 'sonner'
import type { SearchAnalyticsEntry } from '@/types/article'

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function topKeywords(entries: SearchAnalyticsEntry[], n = 8): { keyword: string; count: number; avgResults: number }[] {
  const map: Record<string, { count: number; totalResults: number }> = {}
  for (const e of entries) {
    const k = e.keyword.toLowerCase()
    if (!map[k]) map[k] = { count: 0, totalResults: 0 }
    map[k].count++
    map[k].totalResults += e.result_count ?? 0
  }
  return Object.entries(map)
    .map(([keyword, { count, totalResults }]) => ({ keyword, count, avgResults: Math.round(totalResults / count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
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
  static:  { label: 'Static map', colour: 'bg-blue-500' },
  llm:     { label: 'AI-expanded', colour: 'bg-purple-500' },
  boolean: { label: 'Boolean query', colour: 'bg-green-500' },
  raw:     { label: 'Raw keyword', colour: 'bg-amber-500' },
  unknown: { label: 'Unknown', colour: 'bg-stone-400' },
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Analytics() {
  const apiReady = useContext(ApiReadyContext)
  const { isSignedIn, isLoaded } = useUser()
  const [entries, setEntries] = useState<SearchAnalyticsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState<7 | 30 | 90>(30)

  useEffect(() => {
    if (!apiReady || !isSignedIn) return
    setLoading(true)
    api.getSearchAnalytics(days)
      .then(setEntries)
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [apiReady, isSignedIn, days])

  const daily = groupByDay(entries)
  const top = topKeywords(entries)
  const breakdown = expansionBreakdown(entries)
  const avgResults = entries.length
    ? Math.round(entries.reduce((s, e) => s + (e.result_count ?? 0), 0) / entries.length)
    : 0
  const maxDayCount = Math.max(...daily.map(d => d.count), 1)

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Search Analytics</h1>
              <p className="text-sm text-stone-500 dark:text-slate-400">
                {isLoaded && isSignedIn
                  ? `${entries.length} searches in the last ${days} days`
                  : 'Sign in to view your search analytics'}
              </p>
            </div>
          </div>
          {isSignedIn && (
            <div className="flex gap-1">
              {([7, 30, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${days === d
                    ? 'bg-slate-900 text-white dark:bg-slate-600'
                    : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Sign-in gate */}
      {isLoaded && !isSignedIn && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Lock className="w-12 h-12 text-stone-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-stone-700 dark:text-slate-300 mb-1">Sign in to view analytics</h3>
          <p className="text-stone-400 dark:text-slate-500 text-sm max-w-xs mb-4">
            Your search activity is tracked per account. Sign in to see insights.
          </p>
          <Link to="/sign-in">
            <Button className="bg-slate-900 hover:bg-slate-800 text-white gap-2">
              <LogIn className="w-4 h-4" /> Sign In
            </Button>
          </Link>
        </div>
      )}

      {isLoaded && isSignedIn && (
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl skeleton-shimmer" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
              <Search className="w-10 h-10 text-stone-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-stone-700 dark:text-slate-300 mb-1">No search history yet</h3>
              <p className="text-stone-400 dark:text-slate-500 text-sm max-w-xs">
                Use keyword monitoring to start building your analytics history.
              </p>
              <Link to="/keywords" className="mt-4">
                <Button variant="outline" size="sm">Go to Keywords</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-6 max-w-5xl">

              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total searches', value: entries.length, icon: Search, colour: 'text-blue-600' },
                  { label: 'Unique keywords', value: new Set(entries.map(e => e.keyword.toLowerCase())).size, icon: TrendingUp, colour: 'text-green-600' },
                  { label: 'Avg results / search', value: avgResults, icon: BarChart2, colour: 'text-purple-600' },
                  { label: 'AI-expanded queries', value: breakdown.find(b => b.source === 'llm')?.count ?? 0, icon: Zap, colour: 'text-amber-600' },
                ].map(({ label, value, icon: Icon, colour }) => (
                  <div key={label} className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-4">
                    <div className={`${colour} mb-2`}><Icon className="w-5 h-5" /></div>
                    <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{value.toLocaleString()}</div>
                    <div className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Searches over time */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                  <h2 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 text-sm">Searches per day</h2>
                  {daily.length === 0 ? (
                    <p className="text-xs text-stone-400">No data</p>
                  ) : (
                    <div className="flex items-end gap-1 h-32">
                      {daily.map(({ date, count }) => (
                        <div key={date} className="flex flex-col items-center flex-1 min-w-0 gap-1 group">
                          <div
                            className="w-full rounded-t bg-slate-800 dark:bg-slate-400 transition-all group-hover:bg-blue-600 dark:group-hover:bg-blue-400"
                            style={{ height: `${(count / maxDayCount) * 100}%`, minHeight: 2 }}
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

                {/* Expansion source breakdown */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                  <h2 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 text-sm">Query expansion method</h2>
                  <div className="space-y-2.5">
                    {breakdown.map(({ source, count, pct }) => {
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

              {/* Top keywords */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-5">
                <h2 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 text-sm">Most searched keywords</h2>
                <div className="space-y-2">
                  {top.map(({ keyword, count, avgResults: avg }) => {
                    const pct = Math.round((count / (top[0]?.count || 1)) * 100)
                    return (
                      <div key={keyword} className="flex items-center gap-3 group">
                        <span className="w-36 text-sm font-medium text-stone-800 dark:text-slate-200 truncate capitalize">{keyword}</span>
                        <div className="flex-1 h-2 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-700 dark:bg-slate-400 rounded-full group-hover:bg-blue-600 dark:group-hover:bg-blue-400 transition-colors" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 text-xs text-stone-500 dark:text-slate-400 text-right">{count}×</span>
                        <span className="w-16 text-xs text-stone-400 dark:text-slate-500 text-right hidden lg:block">~{avg} results</span>
                        <Link to={`/keywords`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="text-xs text-blue-600 hover:underline">View</button>
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  )
}
