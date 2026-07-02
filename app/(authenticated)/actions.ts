"use server";

import { verifySession } from "@/lib/dal";
import { getUnreadNotificationCount } from "@/lib/notification";

/**
 * Current unread-notification count for the signed-in user.
 *
 * Used by the header badge to resync on socket reconnect (US-062 mn8): the
 * `notification:new` stream only increments an in-memory counter, so any events
 * missed during a disconnect window would leave the badge under-counting until
 * the next full navigation. Re-fetching authoritative state on "connect" heals it.
 */
export async function getUnreadNotificationCountAction(): Promise<number> {
  const { userId } = await verifySession();
  return getUnreadNotificationCount(userId);
}
