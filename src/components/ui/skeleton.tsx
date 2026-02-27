import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    (<div
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props} />)
  );
}

export { Skeleton }
