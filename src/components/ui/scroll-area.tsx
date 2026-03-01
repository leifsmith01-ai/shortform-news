import * as React from "react"
import { cn } from "@/lib/utils"

// Plain native-overflow scroll container.
//
// We intentionally do NOT use Radix ScrollAreaPrimitive here. Radix 1.2.x
// sets overflow-y:hidden on the Viewport when its custom scrollbar hasn't
// been triggered (which never happens on touch/mobile — there is no hover).
// That leaves the scroll container permanently non-scrollable on mobile.
//
// overflow-y:scroll (not auto) is intentional: Chrome only creates a
// composited scroll layer for `auto` after detecting overflow, which can
// race with a React DOM swap (e.g. skeletons → article cards). Using
// `scroll` forces a persistent scroll layer from mount, so touch-scroll
// is always registered before the user's first swipe.
//
// ResizeObserver: Chrome mobile's compositor thread doesn't re-evaluate
// scroll bounds when content size changes dynamically. We observe content
// size and toggle scrollTop to force the compositor to re-create the
// scroll layer.
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const internalRef = React.useRef<HTMLDivElement>(null)

  // Combine forwarded ref with internal ref
  React.useImperativeHandle(ref, () => internalRef.current!)

  // Force Chrome mobile compositor to re-evaluate scroll bounds
  // when content size changes (e.g. skeletons → article cards).
  React.useEffect(() => {
    const el = internalRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      // Double-rAF ensures the compositor has committed the previous frame
      // before we toggle scrollTop to force a scroll layer re-evaluation.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (el.scrollHeight > el.clientHeight) {
            const prev = el.scrollTop
            // Toggle scrollTop to force compositor re-evaluation
            el.scrollTop = prev + 1
            el.scrollTop = prev
          }
        })
      })
    })

    // Observe direct children for size changes
    Array.from(el.children).forEach(child => observer.observe(child))

    // Also observe the container itself for size changes
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={internalRef}
      className={cn(
        "relative overflow-y-scroll touch-pan-y min-h-0",
        className
      )}
      style={{
        WebkitOverflowScrolling: 'touch',
        willChange: 'scroll-position',
      } as React.CSSProperties}
      {...props}
    >
      {children}
      {/* 1 px spacer — keeps the -webkit-overflow-scrolling compositing layer
          1 px from its absolute scroll boundary. Without this, Safari snaps
          scrollTop to 0 and freezes the layer when the rubber-band bounce
          comes to rest at the exact maximum scroll position. */}
      <div aria-hidden style={{ height: 1 }} />
    </div>
  )
})
ScrollArea.displayName = "ScrollArea"

// No-op stub kept so that existing imports of ScrollBar still compile.
const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (_props, _ref) => null
)
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
