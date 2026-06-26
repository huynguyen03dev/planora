import Link from "next/link";

import { AuthenticatedHeaderActions } from "@/components/authenticated-header-actions";
import { verifySession } from "@/lib/dal";
import { getUnreadNotificationCount } from "@/lib/notification";
import { SocketLifecycleProvider } from "@/lib/realtime/socket-lifecycle-provider";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await verifySession();
  const unreadCount = await getUnreadNotificationCount(userId);

  return (
    <SocketLifecycleProvider>
      <div className="flex min-h-screen flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <Link href="/boards" className="text-lg font-semibold">
            Planora
          </Link>
          <AuthenticatedHeaderActions initialUnreadCount={unreadCount} />
        </header>
        {children}
      </div>
    </SocketLifecycleProvider>
  );
}
