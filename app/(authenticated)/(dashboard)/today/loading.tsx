import { Skeleton } from "@/components/ui/skeleton";

export default function TodayLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <p role="status" className="sr-only">
        Loading your day…
      </p>
      <div className="space-y-1">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>
      {[0, 1, 2, 3].map((section) => (
        <div key={section} className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ))}
    </main>
  );
}
