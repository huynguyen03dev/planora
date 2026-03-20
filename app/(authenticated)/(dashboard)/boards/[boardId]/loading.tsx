export default function BoardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="h-28 animate-pulse rounded-lg bg-muted" />
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
