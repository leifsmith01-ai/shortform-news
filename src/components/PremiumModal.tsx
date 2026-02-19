import React from 'react'
import { Tag, Bell, TrendingUp, Sparkles, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface PremiumModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PREMIUM_FEATURES = [
  { icon: Tag,        text: 'Track unlimited keywords across all news sources' },
  { icon: Bell,       text: 'Instant alerts when tracked keywords appear' },
  { icon: TrendingUp, text: 'Keyword trend analytics and match history' },
  { icon: Sparkles,   text: 'AI-powered keyword suggestions based on your reading' },
]

export default function PremiumModal({ open, onOpenChange }: PremiumModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-200">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <DialogTitle className="text-center text-2xl">Upgrade to Premium</DialogTitle>
          <DialogDescription className="text-center text-sm text-stone-500 mt-1">
            Unlock keyword tracking and advanced features to take control of your news feed.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 my-2">
          {PREMIUM_FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm text-stone-700 leading-relaxed">{text}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 mt-2">
          <Button
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold h-11"
            onClick={() => {
              window.open('mailto:support@shortformnews.app?subject=Premium Upgrade', '_blank')
            }}
          >
            Upgrade to Premium
          </Button>
          <Button
            variant="ghost"
            className="w-full text-stone-500"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
