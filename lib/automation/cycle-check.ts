/**
 * Save-time STATIC cycle warning (advisory only) for automation rules.
 *
 * A rule's actions can produce events that are themselves triggers. If another
 * enabled rule (or the rule being saved) triggers on one of those produced
 * event types in the same workspace, the two can chain — and a misconfigured
 * pair can loop. The RUNTIME loop guard (ChainTracker, depth cap 5, per-chain
 * (ruleId, cardId) dedup) makes such loops *safe* — they always halt — so this
 * check is purely advisory: it surfaces a warning at save time so an author can
 * reconsider, but it NEVER blocks the save.
 *
 * This module is pure (no DB, no async) so it is trivially unit-testable; the
 * Server Action supplies the workspace's rule set it read from the DB.
 *
 * The action→produced-trigger mapping MUST mirror the executor's `producedEvents`
 * mapping (lib/automation/executor.ts). If the executor changes which events an
 * action produces, update this table with it.
 */

import type { ActionStep, TriggerType } from "@/lib/schemas/automation";

/**
 * The trigger-event type an action step produces when it changes card state,
 * mirroring the executor. Steps that produce no trigger event (set-priority,
 * remove-label, remove-member, notify-member) map to `null`.
 */
export function producedTriggerType(step: ActionStep): TriggerType | null {
  switch (step.type) {
    case "move-card-to-list":
      return "card-moved-to-list";
    case "add-label":
      return "label-added-to-card";
    case "assign-member":
      return "member-assigned";
    case "set-completion":
      return step.completed ? "card-completed" : "card-reopened";
    default:
      return null;
  }
}

/** Distinct trigger-event types a rule's action list can produce. */
export function producedTriggerTypes(actions: ActionStep[]): TriggerType[] {
  const seen = new Set<TriggerType>();
  for (const step of actions) {
    const produced = producedTriggerType(step);
    if (produced) seen.add(produced);
  }
  return [...seen];
}

/** A rule already saved in the workspace, reduced to what the check needs. */
export interface CandidateRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
}

/**
 * Given the rule being saved (its action list + its own trigger type) and the
 * other rules in the same workspace, return advisory warning strings describing
 * potential chains/cycles. Empty array ⇒ no advisory.
 *
 * `selfId` is the id of the rule being updated (omit for create) so a genuine
 * SELF-cycle (a rule whose action re-triggers itself) is flagged distinctly and
 * not double-counted against the same row in the workspace set.
 */
export function detectStaticCycleWarnings(params: {
  selfId?: string;
  selfTriggerType: TriggerType;
  actions: ActionStep[];
  workspaceRules: CandidateRule[];
}): string[] {
  const { selfId, selfTriggerType, actions, workspaceRules } = params;
  const produced = producedTriggerTypes(actions);
  const warnings: string[] = [];

  // Self-cycle: an action produces the very event this rule triggers on.
  if (produced.includes(selfTriggerType)) {
    warnings.push(
      `This rule's action produces a "${selfTriggerType}" event — its own trigger — so it may re-trigger itself. The engine caps automation chains at depth 5, so it will halt safely, but review the configuration.`,
    );
  }

  // Cross-rule chains: another ENABLED rule triggers on one of our produced events.
  for (const other of workspaceRules) {
    if (!other.enabled) continue;
    if (selfId && other.id === selfId) continue; // self-cycle handled above
    if (produced.includes(other.triggerType)) {
      warnings.push(
        `This rule's action produces a "${other.triggerType}" event, which triggers rule "${other.name}". Chained automation will run (capped at depth 5).`,
      );
    }
  }

  return warnings;
}
