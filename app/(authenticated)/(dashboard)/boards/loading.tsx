export default function BoardsLoading() {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="w-full border-b p-4 md:w-64 md:border-b-0 md:border-r md:p-5">
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-4 space-y-2">
          <div className="h-9 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded bg-muted" />
        </div>
      </aside>

      <main className="flex-1 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </div>
      </main>
    </div>
  );
}
