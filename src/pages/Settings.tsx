import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Building2, Check } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { TRUSTED_SOURCES, SOURCE_GROUPS, ALL_SOURCE_DOMAINS } from '@/lib/sources'

function getStoredSources(): string[] {
  try {
    const stored = localStorage.getItem('selectedSources')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

export default function Settings() {
  const [selectedSources, setSelectedSources] = useState<string[]>(getStoredSources)

  const allSelected = selectedSources.length === 0 || selectedSources.length === ALL_SOURCE_DOMAINS.length

  const isSourceSelected = (domain: string) => {
    if (selectedSources.length === 0) return true
    return selectedSources.includes(domain)
  }

  const toggleSource = (domain: string) => {
    setSelectedSources(prev => {
      if (prev.length === 0) {
        return ALL_SOURCE_DOMAINS.filter(d => d !== domain)
      }
      if (prev.includes(domain)) {
        const next = prev.filter(d => d !== domain)
        return next.length === 0 ? [] : next
      }
      const next = [...prev, domain]
      return next.length === ALL_SOURCE_DOMAINS.length ? [] : next
    })
  }

  const selectAll = () => setSelectedSources([])

  const selectGroup = (group: string, select: boolean) => {
    const groupDomains = TRUSTED_SOURCES.filter(s => s.group === group).map(s => s.domain)
    setSelectedSources(prev => {
      const current = prev.length === 0 ? [...ALL_SOURCE_DOMAINS] : [...prev]
      if (select) {
        const merged = [...new Set([...current, ...groupDomains])]
        return merged.length === ALL_SOURCE_DOMAINS.length ? [] : merged
      } else {
        const filtered = current.filter(d => !groupDomains.includes(d))
        return filtered.length === 0 ? [] : filtered
      }
    })
  }

  useEffect(() => {
    localStorage.setItem('selectedSources', JSON.stringify(selectedSources))
  }, [selectedSources])

  const activeCount = allSelected ? ALL_SOURCE_DOMAINS.length : selectedSources.length

  return (
    <div className="h-full flex flex-col bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
              <p className="text-sm text-stone-500">
                {activeCount} of {ALL_SOURCE_DOMAINS.length} sources active
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              selectAll()
              toast.success('All sources enabled')
            }}
            disabled={allSelected}
          >
            Reset to All
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 lg:p-8 max-w-4xl">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2 mb-1">
              <Building2 className="w-5 h-5 text-stone-500" />
              News Sources
            </h2>
            <p className="text-sm text-stone-500">
              Choose which outlets appear in your feed. Deselect sources you don't want to see. Changes apply immediately.
            </p>
          </div>

          <div className="space-y-8">
            {SOURCE_GROUPS.map(group => {
              const groupSources = TRUSTED_SOURCES.filter(s => s.group === group)
              const selectedInGroup = groupSources.filter(s => isSourceSelected(s.domain)).length
              const allInGroupSelected = selectedInGroup === groupSources.length

              return (
                <motion.div
                  key={group}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
                      {group}
                    </h3>
                    <button
                      onClick={() => selectGroup(group, !allInGroupSelected)}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      {allInGroupSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {groupSources.map(source => {
                      const selected = isSourceSelected(source.domain)
                      return (
                        <label
                          key={source.domain}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                            selected
                              ? 'bg-white border-slate-300 text-stone-900 shadow-sm'
                              : 'bg-stone-100 border-stone-200 text-stone-400'
                          }`}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleSource(source.domain)}
                            className="border-stone-300 data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${selected ? 'text-stone-900' : 'text-stone-400'}`}>
                              {source.name}
                            </p>
                            <p className="text-xs text-stone-400 truncate">{source.domain}</p>
                          </div>
                          {selected && (
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
