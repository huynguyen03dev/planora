import { Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { verifySession } from "@/lib/dal";
import { getNotificationsForUser } from "@/lib/notification";
import { NotificationsListClient } from "./notifications-list-client";

// Inbox cursor pagination: first page = the newest 50 (matches the server
// default limit in lib/notification.ts and the /api/notifications route). The
// client uses the same page size for its Load-more fetches.
const NOTIFICATIONS_PAGE_SIZE = 50;

export default async function NotificationsPage() {
  const { userId } = await verifySession();
  const notifications = await getNotificationsForUser(userId, {
    limit: NOTIFICATIONS_PAGE_SIZE,
  });

  if (notifications.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
        <HugeiconsIcon icon={Notification03Icon} className="size-12 opacity-50" />
        <h2 className="text-lg font-semibold text-foreground">No notifications</h2>
        <p className="text-sm">You&apos;re all caught up! Notifications will appear here.</p>
        <Button asChild variant="secondary">
          <Link href="/boards">Go to boards</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Notifications</h1>
      <NotificationsListClient
        notifications={notifications}
        hasMore={notifications.length === NOTIFICATIONS_PAGE_SIZE}
      />
    </div>
  );
}
