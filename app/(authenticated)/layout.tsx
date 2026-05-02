import Link from "next/link";

import { AuthenticatedHeaderActions } from "@/components/authenticated-header-actions";
import { verifySession } from "@/lib/dal";
import { getUnreadNotificationCount } from "@/lib/notification";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await verifySession();
  const unreadCount = await getUnreadNotificationCount(userId);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <Link href="/boards" className="text-lg font-semibold">
          Planora
        </Link>
        <AuthenticatedHeaderActions initialUnreadCount={unreadCount} />
      </header>
      {children}
    </div>
  );
}
