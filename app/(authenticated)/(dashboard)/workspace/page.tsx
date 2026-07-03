import Link from "next/link";
import { Analytics01Icon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { verifySession } from "@/lib/dal";
import { listWorkspaceMembershipsByUserId } from "@/lib/workspace";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export default async function WorkspacePage() {
  const { userId } = await verifySession();

  const memberships = await listWorkspaceMembershipsByUserId(userId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <p className="text-sm text-muted-foreground">
          Choose a workspace to open its boards, members, and settings.
        </p>
      </header>

      {memberships.length > 0 ? (
        <ul className="space-y-2">
          {memberships.map((membership) => {
            const { workspace, role } = membership;
            return (
              <li
                key={workspace.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4"
              >
                <Link
                  href={`/boards?workspace=${workspace.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-primary/10 text-sm font-bold text-primary">
                    {workspace.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{workspace.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[role] ?? role}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-1">
                  <Link
                    href={`/workspace/${workspace.slug}/members`}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <HugeiconsIcon icon={UserMultipleIcon} className="size-4" />
                    Members
                  </Link>
                  <Link
                    href={`/workspace/${workspace.slug}/dashboard`}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <HugeiconsIcon icon={Analytics01Icon} className="size-4" />
                    Analytics
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          You are not a member of any workspace yet.
        </p>
      )}
    </main>
  );
}
