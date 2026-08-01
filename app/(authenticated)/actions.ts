"use server";

import { verifySession } from "@/lib/dal";
import { getPendingInvitationCount } from "@/lib/invitation";
import { getUnreadNotificationCount } from "@/lib/notification";

/**
 * Authoritative inbox-badge counts (unread notifications + pending
 * invitations) for the signed-in user.
 *
 * Used by the header badge to resync on socket reconnect (US-062 mn8 extended
 * by US-083 W2): the `notification:new` / `invitation:new` streams only
 * increment in-memory counters, so any events missed during a disconnect
 * window would leave the badge under-counting until the next full navigation.
 * Re-fetching both halves of the badge from the DB on "connect" heals it.
 *
 * Both counts ride ONE Server Action (and therefore one route re-render) so
 * the two halves can never resync out of step, and the E2E connect-resync
 * barrier keeps its single-POST contract (see the US-083 W1 tripwire).
 */
export async function getInboxBadgeCountsAction(): Promise<{
  unread: number;
  invitations: number;
}> {
  const { userId, user } = await verifySession();
  const [unread, invitations] = await Promise.all([
    getUnreadNotificationCount(userId),
    getPendingInvitationCount(user.email),
  ]);
  return { unread, invitations };
}
