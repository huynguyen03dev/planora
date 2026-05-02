import { Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { verifySession } from "@/lib/dal";
import { getNotificationsForUser } from "@/lib/notification";
import { NotificationsListClient } from "./notifications-list-client";

export default async function NotificationsPage() {
  const { userId } = await verifySession();
  const notifications = await getNotificationsForUser(userId);

  if (notifications.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
        <HugeiconsIcon icon={Notification03Icon} className="size-12 opacity-50" />
        <h2 className="text-lg font-semibold text-foreground">No notifications</h2>
        <p className="text-sm">You&apos;re all caught up! Notifications will appear here.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Notifications</h1>
      <NotificationsListClient notifications={notifications} />
    </div>
  );
}
