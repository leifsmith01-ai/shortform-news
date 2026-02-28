import * as React from "react"
import { cn } from "@/lib/utils"

// Plain native-overflow scroll container.
//
// We intentionally do NOT use Radix ScrollAreaPrimitive here. Radix 1.2.x
// sets overflow-y:hidden on the Viewport when its custom scrollbar hasn't
// been triggered (which never happens on touch/mobile — there is no hover).
// That leaves the scroll container permanently non-scrollable on mobile.
//
// A native div with overflow-y:auto has no such conditional logic: the
// browser handles touch-scroll directly, and the scrollbar is styled by the
// global ::-webkit-scrollbar rules in index.css.
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative overflow-y-auto overscroll-contain touch-pan-y min-h-0", className)}
    style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
    {...props}
  >
    {children}
    {/* 1 px spacer — keeps the -webkit-overflow-scrolling compositing layer
        1 px from its absolute scroll boundary. Without this, Safari snaps
        scrollTop to 0 and freezes the layer when the rubber-band bounce
        comes to rest at the exact maximum scroll position. */}
    <div aria-hidden style={{ height: 1 }} />
  </div>
))
ScrollArea.displayName = "ScrollArea"

// No-op stub kept so that existing imports of ScrollBar still compile.
const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (_props, _ref) => null
)
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
