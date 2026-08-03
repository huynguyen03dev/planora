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
 * NOT fire socket emits or notifications directly.
 *
 * Failure isolation (decision 0030, US-075): each action step runs inside its
 * own try/catch. A structured stale-target `RuleExecutionError` (code set) is
 * ISOLATED — recorded in the result's per-step outcomes (status/code/target id)
 * for the evaluator to audit into RuleExecutionLog.metadata — and the next
 * independent step still runs (best-effort). Any OTHER error is unexpected and
 * propagates → aborts the shared tx (retained pre-0030 behavior).
 *
 * See: docs/decisions/0022-automation-rules-engine.md
 *      docs/decisions/0030-automation-rule-failure-isolation-semantics.md
 *      docs/stories/epics/E06-automation/US-066-automation-rules-engine/design.md
 */

import type { Prisma } from "@/app/generated/prisma/client";

import type { ActionStep } from "@/lib/schemas/automation";
import type { TriggerType } from "@/lib/schemas/automation";
import {
  RuleExecutionError,
  STALE_TARGET_CODES,
  type ActionType,
  type StaleTargetCode,
  type RuleEventPayload,
} from "./types";
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

import { resolveRecipient, resolveRemoveScope, CrossWorkspaceTargetError } from "./resolver";

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
    name: string;
    workspaceId: string;
    boardId: string | null;
    actions: ActionStep[];
  };
  event: RuleEventPayload;
  actorId: string;
  /** The trigger type of the evaluation that produced this execution — threaded
   *  into RuleExecutionError context so logRuleExecutionError persists the real
   *  trigger, not a hardcoded fallback (US-074 Slice B2 audit fix). */
  triggerType: TriggerType;
  /** Chain tracker identity and depth for the current evaluation cascade.
   *  Empty string / 0 when no cascade tracking applies (direct call). */
  chainId: string;
  chainDepth: number;
}

export interface ExecuteRuleResult {
  effects: DeferredEffect[];
  producedEvents: ProducedEvent[];
  /** Per-step outcomes, one entry per action step in order (decision 0030).
   *  Failed entries carry the structured stale-target code + target id so the
   *  evaluator can derive the overall status and audit them into
   *  RuleExecutionLog.metadata. */
  stepOutcomes: StepOutcome[];
}

/** Outcome of one action step (decision 0030 two-class taxonomy). */
export type StepOutcome =
  | { stepIndex: number; actionType: ActionType; status: "success" }
  | {
      stepIndex: number;
      actionType: ActionType;
      status: "failed";
      code: StaleTargetCode;
      targetId: string | null;
      message: string;
    };

/** The entity id a step targets — the stale-target id an admin must clean up. */
function stepTargetId(step: ActionStep): string | null {
  switch (step.type) {
    case "move-card-to-list":
      return step.targetListId;
    case "add-label":
    case "remove-label":
      return step.labelId;
    case "assign-member":
    case "notify-member":
      return step.recipient;
    default:
      return null;
  }
}

/** Build the RuleExecutionError context shared by every executor throw. */
function staleTargetContext(
  params: ExecuteRuleParams,
  cause: unknown,
): RuleExecutionError["context"] {
  return {
    workspaceId: params.rule.workspaceId,
    ruleId: params.rule.id,
    ruleName: params.rule.name,
    chainId: params.chainId,
    chainDepth: params.chainDepth,
    cardId: params.event.cardId ?? null,
    triggerType: params.triggerType,
    cause,
  };
}

/**
 * Guard: an add/remove-label step must reference a label that exists in the
 * rule's workspace. A deleted label (or one outside the workspace) is a stale
 * target → structured RuleExecutionError (LABEL_NOT_FOUND), isolated per-step
 * by the executor (decision 0030).
 */
async function assertLabelTarget(
  client: Prisma.TransactionClient,
  labelId: string,
  workspaceId: string,
  params: ExecuteRuleParams,
): Promise<void> {
  const label = await client.label.findUnique({
    where: { id: labelId },
    select: { board: { select: { workspaceId: true } } },
  });
  if (!label || label.board.workspaceId !== workspaceId) {
    throw new RuleExecutionError(
      `label "${labelId}" not found in the rule workspace`,
      staleTargetContext(params, new Error(`label "${labelId}" not found in the rule workspace`)),
      STALE_TARGET_CODES.LABEL_NOT_FOUND,
    );
  }
}

/**
 * resolveRecipient with the decision-0030 member-stale-target mapping: a
 * CrossWorkspaceTargetError (uuid literal resolves to a departed / non-member
 * user) becomes a structured RuleExecutionError (MEMBER_NOT_IN_WORKSPACE), so
 * the per-step isolation catches it as expected instead of aborting the tx.
 */
async function resolveMemberRecipient(
  client: Prisma.TransactionClient,
  token: string,
  ctx: { cardId: string; workspaceId: string },
  params: ExecuteRuleParams,
  stepLabel: string,
): Promise<string[]> {
  try {
    return await resolveRecipient(client, token, ctx);
  } catch (error) {
    if (error instanceof CrossWorkspaceTargetError) {
      throw new RuleExecutionError(
        `${stepLabel}: ${error.message}`,
        staleTargetContext(params, error),
        STALE_TARGET_CODES.MEMBER_NOT_IN_WORKSPACE,
      );
    }
    throw error;
  }
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
  const stepOutcomes: StepOutcome[] = [];

  for (const [stepIndex, step] of rule.actions.entries()) {
    try {
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

        // US-074 Slice B2 + decision 0030: validate target list exists, is not
        // archived, and belongs to the rule's workspace before mutating. A
        // stale/missing/foreign target throws a structured RuleExecutionError
        // with a code — the executor's per-step isolation audits it and
        // continues (best-effort), never aborting the primary card mutation.
        const targetList = await client.list.findUnique({
          where: { id: step.targetListId },
          select: {
            archivedAt: true,
            board: { select: { workspaceId: true } },
          },
        });

        if (!targetList) {
          throw new RuleExecutionError(
            `move-card-to-list: target list "${step.targetListId}" not found`,
            {
              workspaceId,
              ruleId: rule.id,
              ruleName: rule.name,
              chainId: params.chainId,
              chainDepth: params.chainDepth,
              cardId,
              triggerType: params.triggerType,
              cause: new Error(`target list "${step.targetListId}" not found`),
            },
            STALE_TARGET_CODES.TARGET_LIST_NOT_FOUND,
          );
        }

        if (targetList.archivedAt !== null) {
          throw new RuleExecutionError(
            `move-card-to-list: target list "${step.targetListId}" is archived`,
            {
              workspaceId,
              ruleId: rule.id,
              ruleName: rule.name,
              chainId: params.chainId,
              chainDepth: params.chainDepth,
              cardId,
              triggerType: params.triggerType,
              cause: new Error(`target list "${step.targetListId}" is archived`),
            },
            STALE_TARGET_CODES.TARGET_LIST_ARCHIVED,
          );
        }

        if (targetList.board.workspaceId !== workspaceId) {
          throw new RuleExecutionError(
            `move-card-to-list: target list "${step.targetListId}" is outside the rule workspace`,
            {
              workspaceId,
              ruleId: rule.id,
              ruleName: rule.name,
              chainId: params.chainId,
              chainDepth: params.chainDepth,
              cardId,
              triggerType: params.triggerType,
              cause: new Error(`target list "${step.targetListId}" is outside the rule workspace`),
            },
            STALE_TARGET_CODES.TARGET_LIST_FOREIGN_WORKSPACE,
          );
        }

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
        // Stale-target guard (decision 0030): a deleted/foreign label is a
        // structured LABEL_NOT_FOUND failure, isolated per-step — never a raw
        // FK violation that would abort the whole tx.
        await assertLabelTarget(client, step.labelId, workspaceId, params);
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
        await assertLabelTarget(client, step.labelId, workspaceId, params);
        const { changed } = await removeCardLabel(cardId, step.labelId, client);
        if (changed) {
          effects.push({ kind: "labels-updated", boardId, cardId });
        }
        break;
      }

      case "assign-member": {
        const ids = await resolveMemberRecipient(client, step.recipient, {
          cardId,
          workspaceId,
        }, params, "assign-member");
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
        const ids = await resolveMemberRecipient(client, step.recipient, {
          cardId,
          workspaceId,
        }, params, "notify-member");
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

      stepOutcomes.push({ stepIndex, actionType: step.type, status: "success" });
    } catch (error) {
      // Decision 0030 two-class taxonomy — HARDENED predicate (review finding):
      // the isolation class is a RuleExecutionError WITH a stale-target code.
      // A code-less RuleExecutionError is the unexpected class: it re-throws
      // and aborts the shared tx exactly like any other non-structured error,
      // so a future guard/step that forgets its code can never silently invert
      // invariant #4 (isolated when it should abort). All executor throw sites
      // currently carry codes; this predicate stays correct even when that is
      // no longer true by construction.
      if (error instanceof RuleExecutionError && error.code != null) {
        stepOutcomes.push({
          stepIndex,
          actionType: step.type,
          status: "failed",
          code: error.code,
          targetId: stepTargetId(step),
          message: error.message,
        });
        continue;
      }
      throw error;
    }
  }

  return { effects, producedEvents, stepOutcomes };
}
