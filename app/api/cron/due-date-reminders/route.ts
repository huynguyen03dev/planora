import { NextResponse } from "next/server";

import db from "@/lib/prisma";
import { getActiveMilestones, resolveRecipients, buildCardSelectionWhere, type Milestone } from "@/lib/due-date-reminders";
import { notifyDueDate } from "@/lib/notification";
import { maxApproachWindowMinutes, evaluateScheduledCard } from "@/lib/automation/scheduled";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/cron/due-date-reminders
 *
 * Scheduled tick that scans for cards approaching or past their due date and
 * fires one `DUE_DATE` notification + one email per recipient per milestone.
 *
 * Self-guards: returns 401 if `CRON_SECRET` is unset or the bearer token
 * doesn't match (LOW-3).
 *
 * Idempotent: safe to call repeatedly — the `CardReminder` unique constraint
 * prevents duplicate notifications.
 */
export async function POST(request: Request) {
  const start = performance.now();

  // ── Self-guard: CRON_SECRET check (LOW-3) ─────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[due-date-scheduler] CRON_SECRET not set — returning 401");
    return NextResponse.json({ error: "Not configured" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Fetch candidate cards ─────────────────────────────────────────────
  const now = new Date();

  const cards = await db.card.findMany({
    where: buildCardSelectionWhere(now),
    select: {
      id: true,
      dueDate: true,
      completedAt: true,
      archivedAt: true,
      deletedAt: true,
      createdById: true,
      title: true,
      list: {
        select: { boardId: true },
      },
      members: {
        select: { userId: true },
      },
    },
  });

  let notified = 0;
  let skipped = 0;
  let errors = 0;

  // We need boardId for the notification linkUrl. Since we have the list
  // relation, we can derive it, but we also need the board title. For
  // efficiency, batch-fetch board titles for all unique board IDs.
  const boardIds = [...new Set(cards.map((c) => c.list?.boardId).filter(Boolean))] as string[];
  const boards = boardIds.length > 0
    ? await db.board.findMany({
        where: { id: { in: boardIds } },
        select: { id: true, title: true },
      })
    : [];
  const boardMap = new Map(boards.map((b) => [b.id, b.title]));

  for (const card of cards) {
    try {
      // MEDIUM-4: per-card try/catch — one bad card doesn't abort the tick
      const dueDate = card.dueDate!;
      const milestones = getActiveMilestones(
        {
          id: card.id,
          dueDate,
          completedAt: card.completedAt,
          archivedAt: card.archivedAt,
          deletedAt: card.deletedAt,
          createdById: card.createdById,
          members: card.members,
        },
        now,
      );

      if (milestones.length === 0) continue;

      const recipientIds = resolveRecipients({
        id: card.id,
        dueDate,
        completedAt: card.completedAt,
        archivedAt: card.archivedAt,
        deletedAt: card.deletedAt,
        createdById: card.createdById,
        members: card.members,
      });

      const boardTitle = boardMap.get(card.list?.boardId ?? "") ?? "Untitled board";
      const boardId = card.list?.boardId ?? "";

      for (const milestone of milestones) {
        for (const userId of recipientIds) {
          // ── Claim-first with rollback (MEDIUM-1) ──────────────────
          // Try-insert the CardReminder row as a claim. On P2002 unique
          // violation, another tick already sent this one — skip.
          try {
            await db.cardReminder.create({
              data: {
                cardId: card.id,
                userId,
                milestone,
              },
            });
          } catch (insertError: unknown) {
            if (
              typeof insertError === "object" &&
              insertError !== null &&
              "code" in insertError &&
              (insertError as { code: string }).code === "P2002"
            ) {
              // Already sent — count as skipped
              skipped++;
              continue;
            }
            // Unexpected DB error — re-throw to per-card catch
            throw insertError;
          }

          // ── Send notification ─────────────────────────────────────
          try {
            await notifyDueDate({
              userId,
              cardId: card.id,
              cardTitle: card.title,
              boardId,
              boardTitle,
              milestone: milestone as Milestone,
              dueDate,
            });
            notified++;
          } catch (notifyError) {
            // Failed to create notification — roll back the claim so
            // the next tick retries (MEDIUM-1).
            console.error(`[due-date-scheduler] Failed to notify user ${userId} for card ${card.id}:`, notifyError);
            await db.cardReminder.deleteMany({
              where: {
                cardId: card.id,
                userId,
                milestone,
              },
            });
            errors++;
          }
        }
      }
    } catch (cardError) {
      console.error(`[due-date-scheduler] Failed to process card ${card.id}:`, cardError);
      errors++;
    }
  }

  // ── Scheduled pass: evaluate due-date-approaching rules ──────────────
  let scheduledApplied = 0;
  let scheduledNotified = 0;
  let scheduledSkipped = 0;
  let scheduledErrors = 0;

  const windowMin = await maxApproachWindowMinutes();
  if (windowMin !== null) {
    // Scan cards with dueDate in [now, now + windowMin*60_000) that are
    // incomplete/non-archived/non-deleted.
    const windowEnd = new Date(now.getTime() + windowMin * 60_000);
    const scheduledCards = await db.card.findMany({
      where: {
        dueDate: { gte: now, lt: windowEnd },
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
        dueDate: true,
        priority: true,
        list: {
          select: {
            id: true,
            boardId: true,
            board: { select: { workspaceId: true } },
          },
        },
      },
    });

    for (const card of scheduledCards) {
      const result = await evaluateScheduledCard({
        card: {
          id: card.id,
          workspaceId: card.list.board.workspaceId,
          boardId: card.list.boardId,
          listId: card.list.id,
          priority: card.priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null,
          dueDate: card.dueDate!, // guaranteed non-null by where clause
        },
        now,
      });
      scheduledApplied += result.applied;
      scheduledNotified += result.notified;
      scheduledSkipped += result.skipped;
      scheduledErrors += result.errors;
    }
  }

  const elapsedMs = Math.round(performance.now() - start);

  console.log(
    `[due-date-scheduler] processed=${cards.length} notified=${notified} skipped=${skipped} errors=${errors}` +
    ` scheduledApplied=${scheduledApplied} scheduledNotified=${scheduledNotified} scheduledSkipped=${scheduledSkipped} scheduledErrors=${scheduledErrors}` +
    ` elapsedMs=${elapsedMs}`,
  );

  return NextResponse.json({
    processed: cards.length,
    notified,
    skipped,
    errors,
    scheduledApplied,
    scheduledNotified,
    scheduledSkipped,
    scheduledErrors,
    elapsedMs,
  });
}
