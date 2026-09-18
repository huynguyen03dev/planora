import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import { lockWorkspaceRowForUpdate } from "@/lib/ordering";
import { actionsSchema, triggerConfigSchema, type TriggerType } from "@/lib/schemas/automation";

import { AUTOMATION_ACTOR_USER_ID } from "./index";
import { evaluateConditions } from "./matcher";
import { ChainTracker } from "./loop-guard";
import { executeRuleActions, type DeferredEffect, type StepOutcome } from "./executor";
import { RuleExecutionError, type RuleEventPayload } from "./types";

type Client = Prisma.TransactionClient;

type ExecutionStatus = "success" | "partially_failed" | "failed" | "skipped" | "error" | "halted";

export interface EvaluateRulesParams {
  /** The trigger's transaction client — all rule reads/writes share it. */
  client: Client;
  workspaceId: string;
  triggerType: TriggerType;
  /** The triggering event; must carry cardId + boardId for card-scoped triggers. */
  event: RuleEventPayload;
  /** Chain tracker; omitted at the root call (a fresh chain is created). */
  chain?: ChainTracker;
  /** Actor attributed to rule-driven writes; defaults to the automation system user. */
  actorId?: string;
  /**
   * When set, enables scheduled claim-first mode (Tier 1 dedup). A success
   * row is written BEFORE executing actions; on P2002 the rule is skipped.
   * NOT propagated into recursive child calls (cascades from a scheduled rule
   * produce card-triggered events, not scheduled ones).
   */
  dedupKey?: string;
}

export interface EvaluateRulesResult {
  /** Post-commit effects (realtime emits + notifications) accumulated across the cascade. */
  effects: DeferredEffect[];
}

/**
 * Orchestrator: fetch the workspace's enabled rules for this trigger type,
 * evaluate their conditions against the event, run matching rules' actions in
 * the trigger transaction, recurse on the events those actions produce (loop-
 * guarded), and accumulate the post-commit deferred effects.
 *
 * Runs INSIDE the trigger transaction. success/partially_failed/failed/
 * skipped/halted rows are logged in-tx (they commit with the trigger). Since
 * decision 0030, only UNEXPECTED errors escape the executor — the evaluator
 * wraps them in {@link RuleExecutionError} and the caller writes the error row
 * post-rollback, never in-tx.
 */
export async function evaluateRules(
  params: EvaluateRulesParams,
): Promise<EvaluateRulesResult> {
  const { client, workspaceId, triggerType, event, dedupKey } = params;

  // Every automation sequence starts at the workspace serialization boundary.
  // Recursive evaluations share this transaction, so re-acquiring the same row
  // lock is safe and keeps the boundary ahead of every descendant executor.
  await lockWorkspaceRowForUpdate(client, workspaceId);

  const actorId = params.actorId ?? AUTOMATION_ACTOR_USER_ID;
  const chain = params.chain ?? ChainTracker.root();
  const cardId = event.cardId ?? null;

  const effects: DeferredEffect[] = [];

  // Board scope: a null-board rule is workspace-wide; a board-scoped rule fires
  // only for events on its board.
  const boardScope = event.boardId
    ? { OR: [{ boardId: null }, { boardId: event.boardId }] }
    : { boardId: null };

  const rules = await client.rule.findMany({
    where: { workspaceId, triggerType, enabled: true, ...boardScope },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      boardId: true,
      triggerConfig: true,
      actions: true,
    },
  });

  for (const rule of rules) {
    // Condition gate.
    const parsedConfig = triggerConfigSchema.safeParse(rule.triggerConfig);
    const triggerConfig = parsedConfig.success ? parsedConfig.data : {};
    if (!evaluateConditions(triggerType, triggerConfig, event)) {
      continue;
    }

    // Scheduled-window gate (due-date-approaching only): a rule with no
    // beforeMinutes, or an event without dueDate/now, is not window-gated.
    if (triggerType === "due-date-approaching") {
      const before = triggerConfig.beforeMinutes;
      if (before !== undefined && event.dueDate && event.now) {
        const dueMs = Date.parse(event.dueDate);
        const nowMs = Date.parse(event.now);
        const windowStart = dueMs - before * 60_000;
        if (!(nowMs >= windowStart && nowMs < dueMs)) continue; // out of window → skip, no log
      }
    }

    // Loop guards.
    if (cardId && chain.hasFired(rule.id, cardId)) {
      await logExecution(client, {
        workspaceId,
        rule,
        chain,
        cardId,
        triggerType,
        status: "skipped",
        error: "duplicate: rule already fired on this card in the chain",
      });
      continue;
    }
    if (chain.atDepthCap()) {
      await logExecution(client, {
        workspaceId,
        rule,
        chain,
        cardId,
        triggerType,
        status: "halted",
        error: "chain depth limit reached",
      });
      continue;
    }

    // Action payload validation: config error → skip, not a tx abort.
    const parsedActions = actionsSchema.safeParse(rule.actions);
    if (!parsedActions.success) {
      await logExecution(client, {
        workspaceId,
        rule,
        chain,
        cardId,
        triggerType,
        status: "error",
        error: "invalid actions payload",
      });
      continue;
    }

    if (cardId) {
      chain.markFired(rule.id, cardId);
    }

    // Claim-first mode (Tier 1 dedup for scheduled rules): write the claim
    // row BEFORE executing so concurrent ticks can't double-apply. The claim is
    // inserted INSIDE the tx, so if an UNEXPECTED error later aborts the tx,
    // the claim rolls back too and the next tick retries (decision 0030
    // invariant #6). Isolated per-step failures do NOT abort, so the claim
    // commits and the row is finalized (status + per-step audit) below.
    let claimLogId: string | null = null;
    if (dedupKey) {
      try {
        const claimRow = await client.ruleExecutionLog.create({
          data: {
            workspaceId,
            ruleId: rule.id,
            ruleName: rule.name,
            chainId: chain.chainId,
            chainDepth: chain.depth,
            cardId,
            dedupKey,
            actionType: "sequence",
            triggerType,
            status: "success",
          },
        });
        claimLogId = claimRow.id;
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") continue; // already applied — skip rule
        throw e;
      }
    }

    // Execute (decision 0030: isolated per-step; unexpected errors abort).
    try {
      const result = await executeRuleActions({
        client,
        rule: {
          id: rule.id,
          name: rule.name,
          workspaceId,
          boardId: rule.boardId,
          actions: parsedActions.data,
        },
        event,
        actorId,
        triggerType,
        chainId: chain.chainId,
        chainDepth: chain.depth,
      });
      effects.push(...result.effects);

      // Overall status from per-step outcomes (decision 0030):
      //   success           — no step failed
      //   partially_failed  — ≥1 step failed AND ≥1 succeeded
      //   failed            — every step failed (best-effort ran, all isolated)
      const failedSteps = result.stepOutcomes.filter((o) => o.status === "failed");
      const status: ExecutionStatus =
        failedSteps.length === 0
          ? "success"
          : failedSteps.length === result.stepOutcomes.length
            ? "failed"
            : "partially_failed";

      // Per-step audit: structured codes + stale target ids (decision 0030,
      // AC3). Written only when something failed; success rows stay lean.
      const metadata: { steps: StepOutcome[] } | undefined =
        failedSteps.length > 0 ? { steps: result.stepOutcomes } : undefined;
      const errorSummary =
        failedSteps.length > 0
          ? `${failedSteps.length} of ${result.stepOutcomes.length} action steps failed`
          : undefined;

      if (dedupKey && claimLogId) {
        // Invariant #6: the claim row is KEPT for any execution that reached
        // the executor (isolated failures included) — no retry can double-apply
        // successful steps. Finalize its status + per-step audit in place.
        if (failedSteps.length > 0) {
          await client.ruleExecutionLog.update({
            where: { id: claimLogId },
            data: {
              status,
              error: errorSummary ?? null,
              metadata,
            },
          });
        }
      } else {
        await logExecution(client, {
          workspaceId,
          rule,
          chain,
          cardId,
          triggerType,
          status,
          error: errorSummary,
          metadata,
        });
      }

      // Cascade: each produced event may match other rules. Recurse one level
      // deeper (shared chainId + dedup set; the depth cap halts runaways).
      // Invariant #7: producedEvents only ever come from SUCCEEDED steps (a
      // failed step pushes none), so cascades never fan out from a failed step.
      for (const produced of result.producedEvents) {
        const sub = await evaluateRules({
          client,
          workspaceId,
          triggerType: produced.triggerType,
          event: {
            ...produced.payload,
            _chainId: chain.chainId,
            _chainDepth: chain.depth + 1,
          },
          chain: chain.child(),
          actorId,
        });
        effects.push(...sub.effects);
      }
    } catch (cause) {
      // A deeper level already wrapped it — propagate unchanged so the outermost
      // caller logs one error row for the originating failure.
      if (cause instanceof RuleExecutionError) {
        throw cause;
      }
      throw new RuleExecutionError(`automation rule "${rule.name}" failed`, {
        workspaceId,
        ruleId: rule.id,
        ruleName: rule.name,
        chainId: chain.chainId,
        chainDepth: chain.depth,
        cardId,
        triggerType,
        cause,
      });
    }
  }

  return { effects };
}

async function logExecution(
  client: Client,
  args: {
    workspaceId: string;
    rule: { id: string; name: string };
    chain: ChainTracker;
    cardId: string | null;
    triggerType: TriggerType;
    status: ExecutionStatus;
    error?: string;
    /** Per-step audit (decision 0030): structured codes + stale target ids. */
    metadata?: { steps: StepOutcome[] };
  },
): Promise<void> {
  await client.ruleExecutionLog.create({
    data: {
      workspaceId: args.workspaceId,
      ruleId: args.rule.id,
      ruleName: args.rule.name,
      chainId: args.chain.chainId,
      chainDepth: args.chain.depth,
      cardId: args.cardId,
      actionType: "sequence",
      triggerType: args.triggerType,
      status: args.status,
      error: args.error ?? null,
      ...(args.metadata ? { metadata: args.metadata } : {}),
    },
  });
}
