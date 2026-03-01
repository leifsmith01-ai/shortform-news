import * as React from "react"
import { cn } from "@/lib/utils"

// Scroll container that adapts between mobile and desktop.
//
// On DESKTOP (md+): Acts as a nested scroll container with overflow-y:auto
// inside the sidebar + content flex layout.
//
// On MOBILE: Renders as a plain div WITHOUT overflow — the body itself
// is the scroll container. This avoids the Chrome mobile compositor bug
// where nested overflow containers don't register touch-scroll after
// dynamic content changes.
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative min-h-0",
      "md:overflow-y-auto",
      className
    )}
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
