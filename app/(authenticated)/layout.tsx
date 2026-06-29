import Link from "next/link";

import { AuthenticatedHeaderActions } from "@/components/authenticated-header-actions";
import { verifySession } from "@/lib/dal";
import { listReceivedPendingInvitationsByEmail } from "@/lib/invitation";
import { getUnreadNotificationCount } from "@/lib/notification";
import { SocketLifecycleProvider } from "@/lib/realtime/socket-lifecycle-provider";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId, user } = await verifySession();
  const [unreadCount, pendingInvitations] = await Promise.all([
    getUnreadNotificationCount(userId),
    listReceivedPendingInvitationsByEmail(user.email),
  ]);

  return (
    <SocketLifecycleProvider>
      <div className="flex min-h-screen flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <Link href="/boards" className="text-lg font-semibold">
            Planora
          </Link>
          <AuthenticatedHeaderActions
            initialUnreadCount={unreadCount}
            initialInvitationCount={pendingInvitations.length}
          />
        </header>
        {children}
      </div>
    </SocketLifecycleProvider>
  );
}
