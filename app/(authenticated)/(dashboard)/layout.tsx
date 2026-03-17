import Link from "next/link";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1">
      <aside className="flex w-64 flex-col border-r bg-sidebar p-4">
        <nav className="flex flex-col gap-1">
          <Link
            href="/boards"
            className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Home
          </Link>
          <Link
            href="/boards"
            className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Boards
          </Link>
        </nav>

        <div className="mt-6">
          <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Workspaces
          </h3>
          <div className="mt-2 flex flex-col gap-1">
            <div className="rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground">
              My Workspace
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
