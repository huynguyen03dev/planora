import "server-only";

import db from "@/lib/prisma";
import { getCardLabels } from "@/lib/label";
import { getCardMembers } from "@/lib/card-member";
import { notifyAutomation } from "@/lib/notification";
import {
  emitCardMoved,
  emitCardUpdated,
  emitCardLabelsUpdated,
  emitCardMembersUpdated,
  emitCardCompletionUpdated,
} from "@/lib/realtime/server";

import type { DeferredEffect } from "./executor";
import type { RuleExecutionError } from "./evaluator";

/**
 * Fire a rule cascade's deferred effects AFTER the trigger transaction commits.
 *
 * Rule action handlers accumulate lightweight descriptors (which card on which
 * board changed how); the concrete typed socket events carry richer snapshots,
 * so we re-read the affected card's committed state here to build the same
 * payloads the human-driven Server Actions emit. No new event types (0022).
 *
 * Best-effort: a single effect failing (e.g. the socket server is down) must not
 * break the others or the request, so each is isolated.
 */
export async function fireDeferredEffects(effects: DeferredEffect[]): Promise<void> {
  for (const effect of effects) {
    try {
      switch (effect.kind) {
        case "card-moved": {
          emitCardMoved(effect.boardId, {
            cardId: effect.cardId,
            listId: effect.listId,
            position: effect.position,
          });
          break;
        }
        case "card-updated": {
          const card = await db.card.findUnique({
            where: { id: effect.cardId },
            select: { title: true },
          });
          if (card) {
            emitCardUpdated(effect.boardId, { cardId: effect.cardId, title: card.title });
          }
          break;
        }
        case "labels-updated": {
          const labels = await getCardLabels(effect.cardId);
          emitCardLabelsUpdated(effect.boardId, {
            cardId: effect.cardId,
            labels: labels.map((label) => ({ id: label.id, name: label.name, color: label.color })),
          });
          break;
        }
        case "members-updated": {
          const members = await getCardMembers(effect.cardId);
          emitCardMembersUpdated(effect.boardId, { cardId: effect.cardId, members });
          break;
        }
        case "completion-updated": {
          const card = await db.card.findUnique({
            where: { id: effect.cardId },
            select: { completedAt: true },
          });
          emitCardCompletionUpdated(effect.boardId, {
            cardId: effect.cardId,
            completedAt: card?.completedAt ? card.completedAt.toISOString() : null,
          });
          break;
        }
        case "notify-member": {
          await notifyAutomation({
            recipientUserId: effect.recipientId,
            cardId: effect.cardId,
            message: effect.message,
          });
          break;
        }
      }
    } catch (error) {
      console.error(`[automation] failed to fire deferred effect (${effect.kind}):`, error);
    }
  }
}

/**
 * Persist the terminal error row for a failed rule cascade AFTER the trigger
 * transaction has rolled back. Written via the top-level `db` client (NOT the
 * aborted tx) so the audit row survives the rollback (decision 0022). Best-effort.
 */
export async function logRuleExecutionError(error: RuleExecutionError): Promise<void> {
  const { context } = error;
  const message =
    context.cause instanceof Error ? context.cause.message : String(context.cause);

  try {
    await db.ruleExecutionLog.create({
      data: {
        ruleId: context.ruleId,
        chainId: context.chainId,
        chainDepth: context.chainDepth,
        cardId: context.cardId,
        actionType: "sequence",
        triggerType: context.triggerType,
        status: "error",
        error: message.slice(0, 1000),
      },
    });
  } catch (logError) {
    console.error("[automation] failed to write rule error log:", logError);
  }
}
