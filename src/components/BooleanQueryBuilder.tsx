// BooleanQueryBuilder — visual builder for boolean news search queries.
// Lets users add multiple terms joined by AND / OR / NOT operators without
// needing to know the syntax. Outputs a string like:
//   "climate change" OR "global warming" AND NOT coal

import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Operator = 'OR' | 'AND' | 'AND NOT'

interface Term {
  id: string
  value: string
  operator: Operator // operator that joins this term to the previous one
}

interface Props {
  onQueryChange: (query: string) => void
  initialQuery?: string
}

export default function BooleanQueryBuilder({ onQueryChange, initialQuery }: Props) {
  const [terms, setTerms] = useState<Term[]>(() => {
    if (initialQuery) return parseQuery(initialQuery)
    return [{ id: crypto.randomUUID(), value: '', operator: 'OR' }]
  })
  const [input, setInput] = useState('')

  function addTerm(operator: Operator = 'OR') {
    const trimmed = input.trim()
    if (!trimmed) return
    const newTerms = [...terms, { id: crypto.randomUUID(), value: trimmed, operator }]
    setTerms(newTerms)
    setInput('')
    onQueryChange(buildQuery(newTerms))
  }

  function removeTerm(id: string) {
    const newTerms = terms.filter(t => t.id !== id)
    setTerms(newTerms)
    onQueryChange(buildQuery(newTerms))
  }

  function cycleOperator(id: string) {
    const cycle: Operator[] = ['OR', 'AND', 'AND NOT']
    const newTerms = terms.map(t => {
      if (t.id !== id) return t
      const next = cycle[(cycle.indexOf(t.operator) + 1) % cycle.length]
      return { ...t, operator: next }
    })
    setTerms(newTerms)
    onQueryChange(buildQuery(newTerms))
  }

  const operatorColour: Record<Operator, string> = {
    'OR':      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200',
    'AND':     'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200',
    'AND NOT': 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200',
  }

  return (
    <div className="space-y-2">
      {/* Term chips */}
      {terms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {terms.map((t, i) => (
            <div key={t.id} className="flex items-center gap-1">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => cycleOperator(t.id)}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors ${operatorColour[t.operator]}`}
                  title="Click to cycle: OR → AND → AND NOT"
                >
                  {t.operator}
                </button>
              )}
              <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-stone-100 dark:bg-slate-700 text-stone-800 dark:text-slate-200">
                {t.value}
                <button
                  type="button"
                  onClick={() => removeTerm(t.id)}
                  className="rounded-full p-0.5 hover:bg-stone-300 dark:hover:bg-slate-600 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Input + add buttons */}
      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTerm('OR') } }}
          placeholder="Add a term…"
          className="h-8 text-xs flex-1 border-stone-200 dark:border-slate-600 dark:bg-slate-700"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => addTerm('OR')}
          disabled={!input.trim()}
          className="h-8 w-8 text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
          title="Add term (OR)"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addTerm('AND')}
          disabled={!input.trim()}
          className="h-8 px-2 text-[10px] font-bold text-green-700 border-green-200 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
          title="Add term (AND)"
        >
          AND
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addTerm('AND NOT')}
          disabled={!input.trim()}
          className="h-8 px-2 text-[10px] font-bold text-red-700 border-red-200 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
          title="Exclude term (AND NOT)"
        >
          NOT
        </Button>
      </div>

      {/* Preview */}
      {terms.length > 0 && (
        <p className="text-[10px] text-stone-400 dark:text-slate-500 font-mono break-all">
          {buildQuery(terms)}
        </p>
      )}
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildQuery(terms: Term[]): string {
  return terms
    .map((t, i) => {
      const quoted = t.value.includes(' ') ? `"${t.value}"` : t.value
      if (i === 0) return quoted
      return `${t.operator} ${quoted}`
    })
    .join(' ')
}

function parseQuery(query: string): Term[] {
  const parts = query.split(/\s+(AND NOT|AND|OR)\s+/i)
  const terms: Term[] = []
  let opBuffer: Operator = 'OR'

  for (const part of parts) {
    const upper = part.toUpperCase()
    if (upper === 'OR' || upper === 'AND' || upper === 'AND NOT') {
      opBuffer = upper as Operator
    } else {
      const value = part.replace(/^["']+|["']+$/g, '').trim()
      if (value) terms.push({ id: crypto.randomUUID(), value, operator: opBuffer })
      opBuffer = 'OR'
    }
  }
  return terms.length ? terms : [{ id: crypto.randomUUID(), value: '', operator: 'OR' }]
}
