/**
 * Automation rules engine — executor.
 *
 * Runs ONE matched rule's ordered action list inside the trigger's Prisma
 * transaction.  Calls existing transaction-body helpers with the tx client,
 * writes CardHistoryEvent rows attributed to the automation system actor +
 * the ruleId, accumulates "deferred effect" descriptors (realtime emits +
 * notify-member) that the Server Action fires POST-COMMIT, and returns the
 * trigger events its actions produced so a later Phase-6 evaluator can recurse.
 *
 * The executor itself does NOT recurse, does NOT touch ChainTracker, and does
 * NOT fire socket emits or notifications directly.  First failing step throws
 * → aborts the tx.
 *
 * See: docs/decisions/0022-automation-rules-engine.md
 *      docs/stories/epics/E06-automation/US-066-automation-rules-engine/design.md
 */

import type { Prisma } from "@/app/generated/prisma/client";

import type { TriggerType, ActionStep } from "@/lib/schemas/automation";
import { updateCardPriority } from "@/lib/card";
import { setCardCompletion } from "@/lib/card";
import { addCardLabel, removeCardLabel } from "@/lib/label";
import { assignMemberToCard, removeMemberFromCard } from "@/lib/card-member";
import {
  buildCardMoveLifecycleEvents,
  buildCardCompletedEvent,
  buildCardReopenedEvent,
  buildCardMemberAssignedEvent,
  buildCardMemberUnassignedEvent,
  recordCardHistoryEvents,
  type BuildCardHistoryEventInput,
} from "@/lib/card-history";
import { CARD_POSITION_GAP, LIVE_CARD_SCOPE } from "@/lib/ordering";

import type { RuleEventPayload } from "./types";
import { resolveRecipient, resolveRemoveScope } from "./resolver";

// ─── Public types ────────────────────────────────────────────────────

export type DeferredEmit =
  | { kind: "card-moved"; boardId: string; cardId: string; listId: string; position: number }
  | { kind: "card-updated"; boardId: string; cardId: string }
  | { kind: "labels-updated"; boardId: string; cardId: string }
  | { kind: "members-updated"; boardId: string; cardId: string }
  | { kind: "completion-updated"; boardId: string; cardId: string; completed: boolean };

export type DeferredNotification = {
  kind: "notify-member";
  recipientId: string;
  cardId: string;
  message?: string;
  actorId: string;
};

export type DeferredEffect = DeferredEmit | DeferredNotification;

export interface ProducedEvent {
  triggerType: TriggerType;
  payload: RuleEventPayload;
}

export interface ExecuteRuleParams {
  client: Prisma.TransactionClient;
  rule: {
    id: string;
    workspaceId: string;
    boardId: string | null;
    actions: ActionStep[];
  };
  event: RuleEventPayload;
  actorId: string;
}

export interface ExecuteRuleResult {
  effects: DeferredEffect[];
  producedEvents: ProducedEvent[];
}

// ─── Executor ────────────────────────────────────────────────────────

export async function executeRuleActions(
  params: ExecuteRuleParams,
): Promise<ExecuteRuleResult> {
  const { client, rule, event, actorId } = params;

  if (!event.cardId) {
    throw new Error("executeRuleActions: event.cardId is required");
  }
  if (!event.boardId) {
    throw new Error("executeRuleActions: event.boardId is required");
  }

  const cardId = event.cardId;
  const boardId = event.boardId;
  const workspaceId = rule.workspaceId;

  const effects: DeferredEffect[] = [];
  const producedEvents: ProducedEvent[] = [];

  for (const step of rule.actions) {
    switch (step.type) {
      case "set-priority": {
        await updateCardPriority(cardId, step.priority, client);
        effects.push({ kind: "card-updated", boardId, cardId });
        break;
      }

      case "move-card-to-list": {
        const card = await client.card.findUniqueOrThrow({
          where: { id: cardId },
          select: { listId: true, estimateHours: true },
        });
        const fromListId = card.listId;

        const members = await client.cardMember.findMany({
          where: { cardId },
          select: { userId: true },
        });
        const memberIds = members.map((m: { userId: string }) => m.userId);

        // Append to end of target list
        const lastCard = await client.card.findFirst({
          where: { listId: step.targetListId, ...LIVE_CARD_SCOPE },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        const position = lastCard
          ? lastCard.position + CARD_POSITION_GAP
          : CARD_POSITION_GAP;

        await client.card.update({
          where: { id: cardId },
          data: { listId: step.targetListId, position },
        });

        // History
        const moveEvents = buildCardMoveLifecycleEvents({
          workspaceId,
          boardId,
          cardId,
          actorId,
          fromListId,
          toListId: step.targetListId,
          estimateHours: card.estimateHours,
          memberIds,
        }).map((e: BuildCardHistoryEventInput) => ({ ...e, ruleId: rule.id }));
        await recordCardHistoryEvents(client, moveEvents);

        effects.push({ kind: "card-moved", boardId, cardId, listId: step.targetListId, position });
        producedEvents.push({
          triggerType: "card-moved-to-list",
          payload: { cardId, boardId, listIdFrom: fromListId, listIdTo: step.targetListId },
        });
        break;
      }

      case "add-label": {
        const { changed } = await addCardLabel(cardId, step.labelId, client);
        if (changed) {
          effects.push({ kind: "labels-updated", boardId, cardId });
          producedEvents.push({
            triggerType: "label-added-to-card",
            payload: { cardId, boardId, labelId: step.labelId },
          });
        }
        break;
      }

      case "remove-label": {
        const { changed } = await removeCardLabel(cardId, step.labelId, client);
        if (changed) {
          effects.push({ kind: "labels-updated", boardId, cardId });
        }
        break;
      }

      case "assign-member": {
        const ids = await resolveRecipient(client, step.recipient, { cardId, workspaceId });
        let anyChanged = false;
        for (const id of ids) {
          const { changed } = await assignMemberToCard({ cardId, userId: id }, client);
          if (changed) {
            anyChanged = true;
            const historyEvent: BuildCardHistoryEventInput = {
              ...buildCardMemberAssignedEvent(
                workspaceId,
                boardId,
                cardId,
                { targetUserId: id, memberIds: ids },
                actorId,
              ),
              ruleId: rule.id,
            };
            await recordCardHistoryEvents(client, [historyEvent]);
            producedEvents.push({
              triggerType: "member-assigned",
              payload: { cardId, boardId, memberId: id },
            });
          }
        }
        if (anyChanged) {
          effects.push({ kind: "members-updated", boardId, cardId });
        }
        break;
      }

      case "remove-member": {
        const ids = await resolveRemoveScope(client, step.scope, { cardId, workspaceId });
        let anyChanged = false;
        for (const id of ids) {
          const { changed } = await removeMemberFromCard({ cardId, userId: id }, client);
          if (changed) {
            anyChanged = true;
            const historyEvent: BuildCardHistoryEventInput = {
              ...buildCardMemberUnassignedEvent(
                workspaceId,
                boardId,
                cardId,
                { targetUserId: id, memberIds: ids },
                actorId,
              ),
              ruleId: rule.id,
            };
            await recordCardHistoryEvents(client, [historyEvent]);
          }
        }
        if (anyChanged) {
          effects.push({ kind: "members-updated", boardId, cardId });
        }
        break;
      }

      case "set-completion": {
        const card = await client.card.findUniqueOrThrow({
          where: { id: cardId },
          select: {
            completedAt: true,
            listId: true,
            estimateHours: true,
            dueDate: true,
          },
        });

        const cardMembers = await client.cardMember.findMany({
          where: { cardId },
          select: { userId: true },
        });
        const memberIds = cardMembers.map((m: { userId: string }) => m.userId);

        const existingCompletedAt = card.completedAt;
        const { transitioned } = await setCardCompletion(
          client,
          cardId,
          step.completed,
          existingCompletedAt,
        );

        if (transitioned) {
          if (step.completed) {
            const historyEvent: BuildCardHistoryEventInput = {
              ...buildCardCompletedEvent(
                workspaceId,
                boardId,
                cardId,
                {
                  listId: card.listId,
                  estimateHours: card.estimateHours,
                  dueDate: card.dueDate?.toISOString() ?? null,
                  memberIds,
                  firstCompletion: existingCompletedAt === null,
                },
                actorId,
              ),
              ruleId: rule.id,
            };
            await recordCardHistoryEvents(client, [historyEvent]);
          } else {
            const historyEvent: BuildCardHistoryEventInput = {
              ...buildCardReopenedEvent(
                workspaceId,
                boardId,
                cardId,
                {
                  listId: card.listId,
                  dueDate: card.dueDate?.toISOString() ?? null,
                  memberIds,
                },
                actorId,
              ),
              ruleId: rule.id,
            };
            await recordCardHistoryEvents(client, [historyEvent]);
          }
          producedEvents.push({
            triggerType: step.completed ? "card-completed" : "card-reopened",
            payload: { cardId, boardId, listId: card.listId, completed: step.completed },
          });

          // Emit only on a genuine transition — a no-op set-completion (card
          // already in the requested state) must not broadcast a redundant event.
          effects.push({ kind: "completion-updated", boardId, cardId, completed: step.completed });
        }
        break;
      }

      case "notify-member": {
        const ids = await resolveRecipient(client, step.recipient, { cardId, workspaceId });
        for (const id of ids) {
          effects.push({
            kind: "notify-member",
            recipientId: id,
            cardId,
            message: step.message,
            actorId,
          });
        }
        break;
      }
    }
  }

  return { effects, producedEvents };
}
