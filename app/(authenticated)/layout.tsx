import Link from "next/link";

import { AuthenticatedHeaderActions } from "@/components/authenticated-header-actions";
import { TodayNavLink } from "@/components/today/today-nav-link";
import { verifySession } from "@/lib/dal";
import { getPendingInvitationCount } from "@/lib/invitation";
import { getUnreadNotificationCount } from "@/lib/notification";
import { SocketLifecycleProvider } from "@/lib/realtime/socket-lifecycle-provider";
import { listWorkspaceMembershipsByUserId } from "@/lib/workspace";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId, user } = await verifySession();
  const [unreadCount, invitationCount, memberships] = await Promise.all([
    getUnreadNotificationCount(userId),
    getPendingInvitationCount(user.email),
    // U10 (round-2): the user-menu workspace switcher needs the workspace list;
    // one membership query (single include, no N+1) fetched here once per
    // authenticated page render.
    listWorkspaceMembershipsByUserId(userId),
  ]);

  return (
    <SocketLifecycleProvider>
      {/* min-h-dvh (not min-h-screen): on mobile the URL bar makes vh taller
          than the visible area, so screen-pinned pages over-run the fold;
          dvh == vh on desktop. The board page additionally pins its own
          height to dvh (see [boardId]/page.tsx). */}
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <div className="flex items-center gap-1">
            <Link href="/boards" className="text-lg font-semibold">
              Planora
            </Link>
            <TodayNavLink />
          </div>
          <AuthenticatedHeaderActions
            initialUnreadCount={unreadCount}
            initialInvitationCount={invitationCount}
            initialWorkspaces={memberships.map((membership) => membership.workspace)}
          />
        </header>
        {children}
      </div>
    </SocketLifecycleProvider>
  );
}
