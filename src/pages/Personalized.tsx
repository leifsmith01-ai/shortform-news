import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import NewsCard from '@/components/news/NewsCard'
import LoadingCard from '@/components/news/LoadingCard'
import { toast } from 'sonner'
import api from '@/api'

const COUNTRY_NAMES: Record<string, string> = {
  us: 'US', gb: 'UK', ca: 'Canada', au: 'Australia', de: 'Germany',
  fr: 'France', in: 'India', jp: 'Japan', br: 'Brazil', mx: 'Mexico',
  cn: 'China', kr: 'South Korea', it: 'Italy', es: 'Spain', nl: 'Netherlands',
  za: 'South Africa', ng: 'Nigeria', ke: 'Kenya', eg: 'Egypt', ar: 'Argentina',
  sg: 'Singapore', ae: 'UAE', il: 'Israel', tr: 'Turkey', se: 'Sweden',
  no: 'Norway', pl: 'Poland', ch: 'Switzerland', be: 'Belgium', at: 'Austria',
}

const CATEGORY_LABELS: Record<string, string> = {
  technology: 'Technology', business: 'Business', science: 'Science', health: 'Health',
  sports: 'Sports', gaming: 'Gaming', film: 'Film', tv: 'TV',
  politics: 'Politics', world: 'World',
}

function getComboLabel(country: string, category: string) {
  const countryName = COUNTRY_NAMES[country] ?? country.toUpperCase()
  const categoryName = CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
  return `${categoryName} · ${countryName}`
}

interface Combo {
  country: string
  category: string
  count: number
}

interface Reaction {
  category: string
  country: string
  reaction: 'up' | 'down'
}

// Score each country+category combo using reading history and thumbs reactions.
// History reads: +1 per article read
// Thumbs up:     +3 (strong positive signal)
// Thumbs down:   -5 (strong negative — suppress the combo)
// Combos with a final score ≤ 0 are filtered out entirely.
function computeTopCombos(
  history: { country: string; category: string }[],
  reactions: Reaction[],
  limit = 3,
): Combo[] {
  const scores: Record<string, number> = {}

  for (const item of history) {
    if (!item.country || !item.category) continue
    const key = `${item.country}:${item.category}`
    scores[key] = (scores[key] ?? 0) + 1
  }

  for (const r of reactions) {
    if (!r.country || !r.category) continue
    const key = `${r.country}:${r.category}`
    scores[key] = (scores[key] ?? 0) + (r.reaction === 'up' ? 3 : -5)
  }

  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => {
      const [country, category] = key.split(':')
      return { country, category, count }
    })
}

export default function Personalized() {
  const [articles, setArticles] = useState<any[]>([])
  const [topCombos, setTopCombos] = useState<Combo[]>([])
  const [historyCount, setHistoryCount] = useState(0)
  const [likedCount, setLikedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [noHistory, setNoHistory] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Fetch history and reactions in parallel
        const [history, reactions] = await Promise.all([
          api.getReadingHistory(),
          api.getReactions(),
        ])
        setHistoryCount(history.length)
        setLikedCount(reactions.filter((r: Reaction) => r.reaction === 'up').length)

        if (history.length === 0 && reactions.length === 0) {
          setNoHistory(true)
          setLoading(false)
          return
        }

        const combos = computeTopCombos(history, reactions, 3)
        setTopCombos(combos)

        if (combos.length === 0) {
          setNoHistory(true)
          setLoading(false)
          return
        }

        const allArticles: any[] = []
        for (const { country, category } of combos) {
          try {
            const result = await api.fetchNews({
              countries: [country],
              categories: [category],
              dateRange: 'week',
            })
            if (result?.articles) {
              allArticles.push(...result.articles)
            }
          } catch {
            // skip failed combo, continue with others
          }
        }

        // Deduplicate by URL
        const seen = new Set<string>()
        const unique = allArticles.filter(a => {
          if (!a.url || seen.has(a.url)) return false
          seen.add(a.url)
          return true
        })

        setArticles(unique.slice(0, 10))
      } catch {
        toast.error('Failed to load personalised feed')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <div className="h-full flex flex-col bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900">For You</h1>
              <p className="text-sm text-stone-500">
                {historyCount > 0 || likedCount > 0
                  ? [
                      historyCount > 0 && `${historyCount} article${historyCount !== 1 ? 's' : ''} read`,
                      likedCount > 0 && `${likedCount} liked`,
                    ].filter(Boolean).join(' · ')
                  : 'Your personalised feed'}
              </p>
            </div>
          </div>

          {topCombos.length > 0 && !loading && (
            <div className="flex items-center gap-2 flex-wrap">
              {topCombos.map(({ country, category }) => (
                <span
                  key={`${country}:${category}`}
                  className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                >
                  {getComboLabel(country, category)}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 lg:p-8">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : noHistory ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-full min-h-[500px] text-center px-6"
            >
              <div className="w-20 h-20 rounded-2xl bg-stone-200 flex items-center justify-center mb-6">
                <BookOpen className="w-10 h-10 text-stone-400" />
              </div>
              <h3 className="text-2xl font-semibold text-stone-900 mb-2">
                Nothing to personalise yet
              </h3>
              <p className="text-stone-500 max-w-sm mb-8 leading-relaxed">
                Read some articles on the Home page and we'll build your personal feed based on what you engage with most.
              </p>
              <Button asChild className="bg-slate-900 hover:bg-slate-800 h-11 px-8">
                <Link to="/">Browse articles</Link>
              </Button>
            </motion.div>
          ) : articles.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
            >
              <Sparkles className="w-10 h-10 text-stone-300 mb-4" />
              <p className="text-stone-500">No articles found for your top interests right now.</p>
              <p className="text-stone-400 text-sm mt-1">Try again later or read more articles to refine your feed.</p>
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
    </div>
  )
}
