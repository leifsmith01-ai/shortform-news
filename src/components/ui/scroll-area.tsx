import * as React from "react"
import { cn } from "@/lib/utils"

// Plain native-overflow scroll container — intentionally minimal.
//
// We do NOT use Radix ScrollAreaPrimitive (overflow-y:hidden on mobile)
// and we do NOT use any JS scroll manipulation (programmatic scrollTop
// changes kill active touch-scroll gestures on Chrome mobile).
//
// The ONLY job of this component is a div with overflow-y:auto and
// the correct flex/height constraints so the browser handles scrolling
// natively on every platform.
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative overflow-y-auto min-h-0", className)}
    {...props}
  >
    {children}
  </div>
))
ScrollArea.displayName = "ScrollArea"

// No-op stub kept so that existing imports of ScrollBar still compile.
const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (_props, _ref) => null
)
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
