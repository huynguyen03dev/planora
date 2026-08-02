import type { Metadata } from "next";

import { TodayView } from "@/components/today/today-view";
import { verifySession } from "@/lib/dal";
import { getPersonalWorkCards } from "@/lib/today-query";

export const metadata: Metadata = {
  title: "Today",
};

/**
 * US-083 W6 — `/today` personal cross-workspace read model.
 *
 * The page is an async RSC for auth + query only: workspace scope is derived
 * server-side from the session user's memberships (never client-supplied),
 * and the cards are handed to the client boundary, which groups them in the
 * viewer's local calendar time. Freshness is explicit page refresh — no
 * cache, no realtime, no automatic refresh.
 */
export default async function TodayPage() {
  const { userId } = await verifySession();
  const { workspaceCount, cards } = await getPersonalWorkCards(userId);

  return <TodayView workspaceCount={workspaceCount} cards={cards} />;
}
