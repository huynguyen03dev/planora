import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import { actionsSchema, triggerConfigSchema, type TriggerType } from "@/lib/schemas/automation";

import { AUTOMATION_ACTOR_USER_ID } from "./index";
import { evaluateConditions } from "./matcher";
import { ChainTracker } from "./loop-guard";
import { executeRuleActions, type DeferredEffect } from "./executor";
import { RuleExecutionError, type RuleEventPayload } from "./types";

type Client = Prisma.TransactionClient;

type ExecutionStatus = "success" | "skipped" | "error" | "halted";

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
 * Runs INSIDE the trigger transaction. success/skipped/halted rows are logged
 * in-tx (they commit with the trigger). A failing action throws
 * {@link RuleExecutionError} — its error row is written post-rollback by the
 * caller, never in-tx.
 */
export async function evaluateRules(
  params: EvaluateRulesParams,
): Promise<EvaluateRulesResult> {
  const { client, workspaceId, triggerType, event, dedupKey } = params;
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
    // --- condition gate ---
    const parsedConfig = triggerConfigSchema.safeParse(rule.triggerConfig);
    const triggerConfig = parsedConfig.success ? parsedConfig.data : {};
    if (!evaluateConditions(triggerType, triggerConfig, event)) {
      continue;
    }

    // --- scheduled-window gate (due-date-approaching only) ---
    // A rule with no beforeMinutes, or an event without dueDate/now, is not window-gated.
    if (triggerType === "due-date-approaching") {
      const before = triggerConfig.beforeMinutes;
      if (before !== undefined && event.dueDate && event.now) {
        const dueMs = Date.parse(event.dueDate);
        const nowMs = Date.parse(event.now);
        const windowStart = dueMs - before * 60_000;
        if (!(nowMs >= windowStart && nowMs < dueMs)) continue; // out of window → skip, no log
      }
    }

    // --- loop guards ---
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

    // --- action payload validation (config error → skip, not a tx abort) ---
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

    // --- claim-first mode (Tier 1 dedup for scheduled rules) ---
    // Write the success row BEFORE executing so concurrent ticks can't double-apply.
    // The claim row is inserted INSIDE the tx, so if a later action throws, the tx
    // (claim included) rolls back and the next tick retries.
    if (dedupKey) {
      try {
        await client.ruleExecutionLog.create({
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
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") continue; // already applied — skip rule
        throw e;
      }
    }

    // --- execute (a failing step throws → aborts the whole tx) ---
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

      // In scheduled claim-first mode the success row was already written above.
      // Only write a post-execute success row when NOT in claim-first mode.
      if (!dedupKey) {
        await logExecution(client, {
          workspaceId,
          rule,
          chain,
          cardId,
          triggerType,
          status: "success",
        });
      }

      // Cascade: each produced event may match other rules. Recurse one level
      // deeper (shared chainId + dedup set; the depth cap halts runaways).
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
    },
  });
}
