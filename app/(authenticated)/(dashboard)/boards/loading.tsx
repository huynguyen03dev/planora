import { Skeleton } from "@/components/ui/skeleton"

export default function BoardsLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      className="flex flex-1 flex-col md:flex-row"
    >
      {/* Sidebar — matches BoardsSidebar structure */}
      <aside className="flex w-full shrink-0 flex-col border-b bg-sidebar p-4 md:w-64 md:border-b-0 md:border-r">
        <nav className="space-y-1">
          <Skeleton className="h-8 w-16" />
        </nav>

        <div className="mt-6">
          <Skeleton className="mb-2 h-4 w-20" />
          <div className="space-y-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Skeleton className="size-6 rounded" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main content — matches BoardsOverview layout */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="space-y-8">
          <Skeleton className="h-7 w-44" />

          {/* First workspace section (with create-board dashed button) */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-border bg-card"
                >
                  {/* Board-card colored header */}
                  <Skeleton className="h-20 rounded-none" />
                  {/* Board-card meta row: text + avatar group */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="flex shrink-0">
                      <Skeleton className="size-6 rounded-full" />
                      <Skeleton className="-ml-1.5 size-6 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
              {/* Create-board dashed button placeholder */}
              <div className="flex min-h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted bg-transparent">
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </section>

          {/* Second workspace section */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-border bg-card"
                >
                  <Skeleton className="h-20 rounded-none" />
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="flex shrink-0">
                      <Skeleton className="size-6 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
