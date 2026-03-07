import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Extend window type for AdSense
declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

type AdFormat = 'auto' | 'fluid' | 'rectangle' | 'vertical' | 'horizontal'

interface AdUnitProps {
  // The ad slot ID from your AdSense dashboard (each ad placement gets its own slot)
  slot: string
  format?: AdFormat
  className?: string
  // Set to true for responsive ads that fill the container width
  responsive?: boolean
}

/**
 * AdUnit — renders a Google AdSense ad slot.
 *
 * - Safe to render before AdSense is approved; shows nothing if not loaded
 * - Each instance pushes once to window.adsbygoogle on mount
 * - Use a unique `slot` ID for each placement (create slots in AdSense dashboard)
 */
export default function AdUnit({
  slot,
  format = 'auto',
  className = '',
  responsive = true,
}: AdUnitProps) {
  const adRef = useRef<HTMLModElement>(null)
  const pushed = useRef(false)
  const location = useLocation()

  // Reset on route change so the ad re-initialises when the component remounts
  // on a new page. This signals AdSense that a new page view has occurred,
  // preventing bursts of push() calls from being read as abnormal navigation.
  useEffect(() => {
    pushed.current = false
  }, [location.pathname])

  useEffect(() => {
    if (pushed.current) return
    try {
      if (typeof window !== 'undefined') {
        window.adsbygoogle = window.adsbygoogle || []
        window.adsbygoogle.push({})
        pushed.current = true
      }
    } catch (e) {
      // AdSense not loaded yet (pending review) — silently ignore
    }
  }, [location.pathname])

  const client = import.meta.env.VITE_ADSENSE_CLIENT

  // Don't render if we don't have a client ID
  if (!client) return null

  return (
    <div className={`ad-unit overflow-hidden ${className}`}>
      <p className="text-xs uppercase tracking-widest text-stone-400 dark:text-slate-500 text-center mb-1 select-none">
        Advertisement
      </p>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </div>
  )
}
