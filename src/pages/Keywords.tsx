import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, Plus, X, Zap, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { usePremium } from '@/hooks/usePremium'
import PremiumModal from '@/components/PremiumModal'
import api from '@/api'

interface Keyword {
  id: string
  keyword: string
  created_at: string
}

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
        Track topics that matter to you and get articles surfaced directly when they appear in your feed.
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

function KeywordChip({ keyword, onDelete }: { keyword: Keyword; onDelete: (id: string) => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-full text-sm font-medium"
    >
      <Tag className="w-3 h-3 text-slate-300 flex-shrink-0" />
      <span>{keyword.keyword}</span>
      <button
        onClick={() => onDelete(keyword.id)}
        className="w-4 h-4 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-white/20 transition-all"
        aria-label={`Remove ${keyword.keyword}`}
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  )
}

export default function Keywords() {
  const { isPremium, isLoaded } = usePremium()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isPremium) return
    setIsLoadingKeywords(true)
    api.getKeywords()
      .then(setKeywords)
      .catch(() => toast.error('Failed to load keywords'))
      .finally(() => setIsLoadingKeywords(false))
  }, [isLoaded, isPremium])

  const handleAdd = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    setIsSubmitting(true)
    try {
      const newKeyword = await api.addKeyword(trimmed)
      setKeywords(prev => [newKeyword, ...prev])
      setInputValue('')
      toast.success(`Tracking "${trimmed}"`)
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

  const handleDelete = async (id: string) => {
    const previous = keywords
    setKeywords(prev => prev.filter(k => k.id !== id))
    try {
      await api.deleteKeyword(id)
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
    <div className="h-screen flex flex-col bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <Tag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              Keyword Tracking
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                PRO
              </span>
            </h1>
            <p className="text-sm text-stone-500">
              {isPremium && isLoaded
                ? `${keywords.length} keyword${keywords.length !== 1 ? 's' : ''} tracked`
                : 'Premium feature'}
            </p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 lg:p-8">
          {!isLoaded && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-white rounded-full animate-pulse max-w-xs" />
              ))}
            </div>
          )}

          {isLoaded && !isPremium && (
            <PremiumGate onUpgradeClick={() => setModalOpen(true)} />
          )}

          {isLoaded && isPremium && (
            <div className="max-w-2xl space-y-8">
              <div>
                <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">
                  Add Keyword
                </h2>
                <div className="flex gap-2">
                  <Input
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. artificial intelligence"
                    className="flex-1 h-11 rounded-xl border-stone-200"
                    maxLength={60}
                    disabled={isSubmitting}
                  />
                  <Button
                    onClick={handleAdd}
                    disabled={isSubmitting || !inputValue.trim()}
                    className="h-11 px-5 bg-slate-900 hover:bg-slate-800 rounded-xl gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Track</span>
                  </Button>
                </div>
                <p className="text-xs text-stone-400 mt-2">
                  Press Enter or click Track to add. Keywords are matched case-insensitively.
                </p>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">
                  Tracked Keywords
                </h2>

                {isLoadingKeywords ? (
                  <div className="flex gap-2 flex-wrap">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-8 w-24 bg-stone-200 rounded-full animate-pulse" />
                    ))}
                  </div>
                ) : keywords.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-stone-200 border-dashed"
                  >
                    <Tag className="w-8 h-8 text-stone-300 mb-3" />
                    <p className="text-stone-500 text-sm">No keywords yet.</p>
                    <p className="text-stone-400 text-xs mt-1">Add one above to get started.</p>
                  </motion.div>
                ) : (
                  <AnimatePresence>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map(kw => (
                        <KeywordChip key={kw.id} keyword={kw} onDelete={handleDelete} />
                      ))}
                    </div>
                  </AnimatePresence>
                )}
              </div>

              {keywords.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-amber-50 border border-amber-100 rounded-2xl p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-amber-900 mb-1">
                        Keywords active
                      </h3>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Articles on the Home page whose title or summary matches any of your tracked keywords will be surfaced with a keyword match badge.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <PremiumModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  )
}
