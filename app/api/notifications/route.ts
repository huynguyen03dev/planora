import { NextResponse } from "next/server";

import { verifySession } from "@/lib/dal";
import { getNotificationsForUser } from "@/lib/notification";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const { userId } = await verifySession();
  const { searchParams } = new URL(request.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  // Optional cursor for inbox pagination: the id of the last notification of
  // the previous page. Omitting it returns the newest page (legacy behavior).
  const cursor = searchParams.get("cursor") ?? undefined;

  const notifications = await getNotificationsForUser(userId, { limit, cursor });

  return NextResponse.json({ notifications });
}
