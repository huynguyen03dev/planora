/**
 * Scheduled-rule orchestration for due-date-approaching rules.
 *
 * Keeps the cron route thin by housing the per-card evaluation loop and the
 * two-tier dedup logic (Tier 1: RuleExecutionLog.dedupKey for rule-application
 * idempotency; Tier 2: CardReminder for notification dedup against the built-in
 * reminder).
 *
 * The dedup milestone for a due-date-approaching rule is ALWAYS "DUE_SOON" (the
 * approaching milestone), pinned as a literal constant.
 */

import "server-only";

import db from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { notifyAutomation } from "@/lib/notification";
import { triggerConfigSchema } from "@/lib/schemas/automation";

import { evaluateRules } from "./evaluator";
import { RuleExecutionError } from "./types";
import { fireDeferredEffects, logRuleExecutionError } from "./effects";
import type { DeferredNotification } from "./executor";
import type { DeferredEffect } from "./executor";

/** The milestone used for all due-date-approaching rule notifications. */
export const SCHEDULED_MILESTONE = "DUE_SOON" as const;

/**
 * Returns the max `beforeMinutes` among enabled due-date-approaching rules,
 * or `null` if there are none. Used to size the scan window (and to skip the
 * whole scheduled pass when zero such rules exist — zero overhead).
 */
export async function maxApproachWindowMinutes(): Promise<number | null> {
  const rules = await db.rule.findMany({
    where: { triggerType: "due-date-approaching", enabled: true },
    select: { triggerConfig: true },
  });

  let maxBefore: number | null = null;
  for (const rule of rules) {
    const parsed = triggerConfigSchema.safeParse(rule.triggerConfig);
    if (!parsed.success) continue;
    const before = parsed.data.beforeMinutes;
    if (before !== undefined) {
      if (maxBefore === null || before > maxBefore) {
        maxBefore = before;
      }
    }
  }
  return maxBefore;
}

/** Card shape needed for evaluateScheduledCard. */
export interface ScheduledCard {
  id: string;
  workspaceId: string;
  boardId: string;
  listId: string;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date;
}

/**
 * Evaluate due-date-approaching rules for ONE card, in its own transaction,
 * then fire effects post-commit with two-tier dedup.
 *
 * - Tier 1 (rule-application idempotency): RuleExecutionLog.dedupKey with
 *   @@unique([ruleId, dedupKey]) inside the tx, handled by evaluateRules.
 * - Tier 2 (notification dedup, R3): CardReminder with
 *   @@unique([cardId, userId, milestone]) post-commit, handled here.
 *
 * Returns counters. Never throws — one bad card must not abort the tick.
 */
export async function evaluateScheduledCard(params: {
  card: ScheduledCard;
  now: Date;
}): Promise<{ applied: number; notified: number; skipped: number; errors: number }> {
  const { card, now } = params;
  const milestone = SCHEDULED_MILESTONE;
  const dedupKey = `${card.id}:${milestone}`;

  let applied = 0;
  let notified = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const result = await db.$transaction(async (tx) => {
      return evaluateRules({
        client: tx as unknown as Prisma.TransactionClient,
        workspaceId: card.workspaceId,
        triggerType: "due-date-approaching",
        event: {
          cardId: card.id,
          boardId: card.boardId,
          listId: card.listId,
          priority: card.priority ?? undefined,
          dueDate: card.dueDate.toISOString(),
          now: now.toISOString(),
        },
        dedupKey,
      });
    });

    applied++;

    // Post-commit: split effects into notify vs non-notify
    const notifyEffects = result.effects.filter(
      (e): e is DeferredNotification => e.kind === "notify-member",
    );
    const otherEffects = result.effects.filter(
      (e): e is DeferredEffect => e.kind !== "notify-member",
    );

    // Fire non-notify effects immediately
    await fireDeferredEffects(otherEffects);

    // For each notify effect, apply Tier 2 (R3) CardReminder dedup
    for (const eff of notifyEffects) {
      // Claim-first: try-insert the CardReminder row. On P2002 → already notified
      // (built-in or another rule), skip.
      try {
        await db.cardReminder.create({
          data: {
            cardId: eff.cardId,
            userId: eff.recipientId,
            milestone,
          },
        });
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") {
          skipped++;
          continue;
        }
        throw e;
      }

      // Send the notification
      try {
        await notifyAutomation({
          recipientUserId: eff.recipientId,
          cardId: eff.cardId,
          message: eff.message,
        });
        notified++;
      } catch {
        // Failed to notify — roll back the claim so the next tick retries
        await db.cardReminder.deleteMany({
          where: {
            cardId: eff.cardId,
            userId: eff.recipientId,
            milestone,
          },
        });
        errors++;
      }
    }
  } catch (cause) {
    if (cause instanceof RuleExecutionError) {
      await logRuleExecutionError(cause);
    } else {
      console.error(`[automation/scheduled] failed to evaluate card ${card.id}:`, cause);
    }
    errors++;
  }

  return { applied, notified, skipped, errors };
}
