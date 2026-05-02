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

  const notifications = await getNotificationsForUser(userId, { limit });

  return NextResponse.json({ notifications });
}
