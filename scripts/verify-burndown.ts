#!/usr/bin/env tsx
/**
 * Independent correctness check for the analytics burndown.
 *
 *  1. Calls the real engine (event-replay path).
 *  2. Re-derives remaining hours from the raw event stream with a SEPARATE
 *     implementation (catches transcription bugs in the engine).
 *  3. Cross-checks the final ("now") point against the live `card` table — a
 *     completely different code path, i.e. the actual source of truth.
 *
 * Usage: npx tsx --env-file=.env scripts/verify-burndown.ts --slug=analytics-demo
 */

import db from "@/lib/prisma";
import { getWorkspaceAnalytics } from "@/lib/analytics/engine";

type CardState = {
  estimate: number | null;
  completedAt: number | null;
  archivedAt: number | null;
  deletedAt: number | null;
};

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function dateMs(v: unknown): number | null {
  return typeof v === "string" && v.length > 0 ? new Date(v).getTime() : null;
}

async function main() {
  const slug = process.argv.slice(2).find((a) => a.startsWith("--slug="))?.split("=")[1] ?? "analytics-demo";
  const ws = await db.workspace.findUnique({ where: { slug }, select: { id: true } });
  if (!ws) throw new Error(`workspace ${slug} not found`);

  const analytics = await getWorkspaceAnalytics({ workspaceId: ws.id, filters: { preset: "30d" } });
  const engineSeries = analytics.burndown;

  // --- Independent replay from raw events -------------------------------------
  const boards = await db.board.findMany({ where: { workspaceId: ws.id, archivedAt: null }, select: { id: true } });
  const events = await db.cardHistoryEvent.findMany({
    where: { workspaceId: ws.id, boardId: { in: boards.map((b) => b.id) } },
    orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }],
  });

  const byCard = new Map<string, typeof events>();
  for (const e of events) {
    const arr = byCard.get(e.cardId) ?? [];
    arr.push(e);
    byCard.set(e.cardId, arr);
  }

  function remainingAt(tMs: number): number {
    let total = 0;
    for (const [, evs] of byCard) {
      const s: CardState = { estimate: null, completedAt: null, archivedAt: null, deletedAt: null };
      for (const e of evs) {
        if (e.occurredAt.getTime() > tMs) break;
        const m = (e.metadata ?? {}) as Record<string, unknown>;
        switch (e.eventType) {
          case "CARD_CREATED":
          case "BASELINE_CAPTURED":
            s.estimate = num(m.estimateHours);
            s.archivedAt = dateMs(m.archivedAt);
            s.deletedAt = dateMs(m.deletedAt);
            s.completedAt = dateMs(m.completedAt);
            break;
          case "CARD_MOVED":
            if ("estimateHours" in m) s.estimate = num(m.estimateHours);
            break;
          case "CARD_COMPLETED":
            if (s.completedAt === null) s.completedAt = e.occurredAt.getTime();
            break;
          case "CARD_REOPENED":
            s.completedAt = null;
            break;
          case "ESTIMATE_SET":
          case "ESTIMATE_CHANGED":
            if ("nextEstimateHours" in m) s.estimate = num(m.nextEstimateHours);
            break;
          case "CARD_ARCHIVED":
            s.archivedAt = e.occurredAt.getTime();
            break;
          case "CARD_RESTORED":
            s.archivedAt = null;
            break;
          case "CARD_DELETED":
            s.deletedAt = e.occurredAt.getTime();
            break;
        }
      }
      const active = !((s.archivedAt && s.archivedAt <= tMs) || (s.deletedAt && s.deletedAt <= tMs) || (s.completedAt && s.completedAt <= tMs));
      if (active && s.estimate !== null && s.estimate > 0) total += s.estimate;
    }
    return total;
  }

  // Compare every day. Each engine point is end-of-day; reconstruct the same instant.
  let maxDiff = 0;
  for (const point of engineSeries) {
    const endOfDayMs = new Date(`${point.date}T23:59:59.999Z`).getTime();
    const mine = remainingAt(endOfDayMs);
    maxDiff = Math.max(maxDiff, Math.abs(mine - point.remainingHours));
  }

  // --- Cross-check "now" against the live card table (source of truth) --------
  const liveCards = await db.card.findMany({
    where: {
      list: { board: { workspaceId: ws.id, archivedAt: null } },
      completedAt: null,
      archivedAt: null,
      deletedAt: null,
      estimateHours: { gt: 0 },
    },
    select: { estimateHours: true },
  });
  const cardTableNow = liveCards.reduce((sum, c) => sum + (c.estimateHours ?? 0), 0);
  const engineNow = engineSeries.at(-1)?.remainingHours ?? 0;

  console.log("Burndown correctness check");
  console.log("──────────────────────────");
  console.log(`Days in series:                 ${engineSeries.length}`);
  console.log(`Engine vs independent replay:   max daily diff = ${maxDiff}  ${maxDiff === 0 ? "✅ identical" : "❌ MISMATCH"}`);
  console.log(`Engine 'now' (event replay):    ${engineNow}h`);
  console.log(`Card table 'now' (source truth):${cardTableNow}h  ${engineNow === cardTableNow ? "✅ match" : "❌ MISMATCH"}`);
  console.log(`Start / Now:                    ${engineSeries[0]?.remainingHours}h / ${engineNow}h`);
  console.log(`Total completed in range:       ${analytics.leadTime.totalCompleted}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
