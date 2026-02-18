import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    // Only push once and only if adsbygoogle is available
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
  }, [])

  const client = import.meta.env.VITE_ADSENSE_CLIENT

  // Don't render if we don't have a client ID
  if (!client) return null

  return (
    <div className={`ad-unit overflow-hidden ${className}`}>
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
