import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

const pillars = [
  {
    title: 'News about the places that matter to you',
    body: "Whether you're tracking developments in your home country, following a region for work, or simply curious about somewhere new — Shortform lets you choose the locations you care about and surfaces news from those places directly.",
  },
  {
    title: 'Topics you choose, not topics chosen for you',
    body: "From politics and business to sport and technology, you decide which categories appear in your feed. No black-box recommendation engine, no engagement-driven rabbit holes — just the subjects you've selected, updated daily.",
  },
  {
    title: 'Control your own algorithm',
    body: 'Big platforms use opaque algorithms to decide what you see. Shortform puts that power back in your hands. Filter by region, refine by topic, combine them however you like. The feed you get is the feed you built.',
  },
  {
    title: 'Media monitoring, for everyone',
    body: 'Tracking news about a specific topic, brand, or region used to require expensive tools — the kind only large businesses could afford. Shortform brings that capability to anyone.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Choose your locations',
    body: "Select one or more countries or regions you want to follow. Shortform pulls in the latest news from those places so you're always up to date on what matters where.",
  },
  {
    num: '02',
    title: 'Pick your topics',
    body: "Choose the categories you care about — politics, business, technology, sport, and more. Mix and match to create a feed that reflects your interests, not a platform's priorities.",
  },
  {
    num: '03',
    title: "Read what's relevant",
    body: 'Shortform aggregates articles from trusted sources and uses AI to generate concise summaries, so you can stay across the news that matters to you without spending hours scrolling.',
  },
  {
    num: '04',
    title: 'Refine anytime',
    body: 'Your preferences are always in your hands. Update your locations and topics whenever your interests change — your personalised feed updates instantly.',
  },
]

export default function About() {
  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
            <Info className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">About</h1>
            <p className="text-sm text-stone-500 dark:text-slate-400">Shortform News</p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 lg:p-8 max-w-3xl">

          {/* Hero */}
          <div className="mb-8 pb-8 border-b border-stone-200 dark:border-slate-700">
            <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-medium px-3 py-1 rounded-full mb-4">
              ✦ About Shortform
            </span>
            <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight tracking-tight mb-4">
              Your news.<br />
              <span className="text-indigo-500">Your</span> way.
            </h2>
            <p className="text-stone-500 dark:text-slate-400 leading-relaxed max-w-xl">
              Shortform is a news platform built on a simple idea: you should be in control of what you read,
              and where in the world you're reading about — not an algorithm designed for someone else. It was
              built to give you a quick, shortform briefing of the top stories that matter to you, through
              AI-generated summaries of news relevant to your interests.
            </p>
          </div>

          {/* Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {pillars.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.35 }}
                style={{ touchAction: 'pan-y' }}
                className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl p-5"
              >
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-2">{p.title}</h3>
                <p className="text-sm text-stone-500 dark:text-slate-400 leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </div>

          {/* Pull quote */}
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 border-l-4 border-l-indigo-500 rounded-xl px-6 py-5 mb-8">
            <blockquote className="text-base font-medium text-stone-800 dark:text-stone-100 leading-relaxed">
              Enterprise-grade media monitoring used to cost thousands. We think staying informed about the
              world should be accessible.
            </blockquote>
            <p className="mt-3 text-xs text-stone-400 dark:text-slate-500 uppercase tracking-widest">— Shortform News</p>
          </div>

          {/* How it works */}
          <p className="text-xs font-semibold tracking-widest uppercase text-stone-400 dark:text-slate-500 mb-4">
            How it works
          </p>
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl overflow-hidden mb-8">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className={`flex gap-4 px-5 py-4 ${i < steps.length - 1 ? 'border-b border-stone-100 dark:border-slate-700' : ''}`}
              >
                <div className="flex-shrink-0 w-8 h-8 mt-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-center text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {step.num}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">{step.title}</h4>
                  <p className="text-sm text-stone-500 dark:text-slate-400 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-6 border-t border-stone-200 dark:border-slate-700 text-xs text-stone-400 dark:text-slate-500">
            <p>© 2026 Shortform News — Australia</p>
            <p>
              <a href="mailto:shortformnewsaus@gmail.com" className="hover:text-stone-700 dark:hover:text-slate-300 transition-colors">
                shortformnewsaus@gmail.com
              </a>
            </p>
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}
