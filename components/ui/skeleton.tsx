import { cn } from "@/lib/utils"

// customized: aria-hidden=true so individual skeleton blocks are decorative
// placeholders, not announced by screen readers. Each page-loading container
// (loading.tsx) composes ONE role="status" wrapper for a single "Loading"
// announcement — avoiding multi-block SR spam.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
