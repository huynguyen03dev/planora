import type { Metadata } from "next";

import { TodayView } from "@/components/today/today-view";
import { verifySession } from "@/lib/dal";
import { TODAY_PAGE_SIZE } from "@/lib/today";
import { getPersonalWorkCards } from "@/lib/today-query";

export const metadata: Metadata = {
  title: "Today",
};

/**
 * US-083 W6 — `/today` personal cross-workspace read model.
 *
 * The page is an async RSC for auth + query only: workspace scope is derived
 * server-side from the session user's memberships (never client-supplied),
 * and the first page of cards is handed to the client boundary, which groups
 * them in the viewer's local calendar time and "Load more"-paginates the
 * rest (explicit pagination — no silent cap). Freshness is explicit page
 * refresh — no cache, no realtime, no automatic refresh.
 */
export default async function TodayPage() {
  const { userId } = await verifySession();
  const { workspaceCount, items, hasMore } = await getPersonalWorkCards(
    userId,
    { limit: TODAY_PAGE_SIZE },
  );

  return (
    <TodayView workspaceCount={workspaceCount} cards={items} hasMore={hasMore} />
  );
}
