"use server";

import { verifySession } from "@/lib/dal";
import { TODAY_PAGE_SIZE, type TodayCard } from "@/lib/today";
import { getPersonalWorkCards } from "@/lib/today-query";
import { loadMoreTodayCardsSchema } from "@/lib/schemas";

export type LoadMoreTodayCardsResult =
  | { success: true; items: TodayCard[]; hasMore: boolean }
  | { success: false; error: string };

/**
 * Explicit cursor pagination for the `/today` personal read model (US-083
 * follow-up) — the "Load more" half of the no-silent-cap contract. The page
 * renders the first TODAY_PAGE_SIZE cards; this action fetches the next page
 * behind the last loaded (dueDate, id) and reports `hasMore` exactly so the
 * button stays until the whole assigned set is visible.
 *
 * Read gate: the session user id is derived from the session (never accepted
 * from the client) and workspace scope comes from the user's memberships
 * inside getPersonalWorkCards — the schema takes no workspace/card id, so a
 * caller can never widen the read past their own memberships.
 */
export async function loadMoreTodayCardsAction(
  formData: FormData,
): Promise<LoadMoreTodayCardsResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = loadMoreTodayCardsSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();

  const { limit, cursorId, cursorDueDate } = parsed.data;
  const cursor = cursorId
    ? { dueDate: cursorDueDate ? new Date(cursorDueDate) : null, id: cursorId }
    : undefined;

  const page = await getPersonalWorkCards(userId, {
    limit: limit ?? TODAY_PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  });

  return { success: true, items: page.items, hasMore: page.hasMore };
}
