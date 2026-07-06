/**
 * Pure matcher functions for the automation rules engine.
 *
 * These are the ONLY functions a Phase-6 evaluator calls to decide whether a
 * rule fires for a given event.  They are deliberately side-effect-free:
 * no DB access, no async, no I/O.
 *
 * Phase 6 depends on the exact exported contract of `matchTrigger` and
 * `evaluateConditions` — do NOT change their signatures or semantics without
 * updating the evaluator and its tests.
 */

import type { TriggerType, TriggerConfig } from "@/lib/schemas/automation";
import type { RuleEventPayload } from "./types";

// ─── matchTrigger ───────────────────────────────────────────────────

/**
 * Trigger-TYPE gate: returns `true` iff the rule's trigger type matches the
 * event's trigger type exactly.  No fuzzy matching, no wildcards.
 */
export function matchTrigger(
  ruleTriggerType: TriggerType,
  eventTriggerType: TriggerType,
): boolean {
  return ruleTriggerType === eventTriggerType;
}

// ─── evaluateConditions ─────────────────────────────────────────────

/**
 * Returns `true` iff every filter present in `triggerConfig` matches the
 * corresponding field in `eventPayload` (AND semantics).
 *
 * Rules:
 *  - An empty `triggerConfig` (`{}`) returns `true` (matches everything).
 *  - A filter key that is `undefined` in `triggerConfig` is skipped.
 *  - A filter whose mapped payload field is `undefined` does NOT match
 *    (return false) — you can only match a value that is present.
 *  - `beforeMinutes` is intentionally IGNORED here; it is a due-date-
 *    approaching window parameter handled by the scheduled-window gate in
 *    evaluateRules (see evaluator.ts).
 *
 * Field→payload mapping:
 *  - boardId  → eventPayload.boardId  (all trigger types)
 *  - priority → eventPayload.priority (all trigger types)
 *  - listId   → for "card-moved-to-list": eventPayload.listIdTo (destination);
 *               for all other trigger types: eventPayload.listId
 *  - fromListId → ONLY for "card-moved-to-list": eventPayload.listIdFrom.
 *               For other trigger types, a present fromListId filter is
 *               treated as inapplicable → no match (stricter option).
 *  - labelId  → eventPayload.labelId
 */
export function evaluateConditions(
  triggerType: TriggerType,
  triggerConfig: TriggerConfig,
  eventPayload: RuleEventPayload,
): boolean {
  // --- boardId ---
  if (triggerConfig.boardId !== undefined) {
    if (eventPayload.boardId !== triggerConfig.boardId) return false;
  }

  // --- priority ---
  if (triggerConfig.priority !== undefined) {
    if (eventPayload.priority !== triggerConfig.priority) return false;
  }

  // --- listId (context-dependent) ---
  if (triggerConfig.listId !== undefined) {
    if (triggerType === "card-moved-to-list") {
      // Compare against destination list
      if (eventPayload.listIdTo !== triggerConfig.listId) return false;
    } else {
      // All other trigger types: compare against payload.listId
      if (eventPayload.listId !== triggerConfig.listId) return false;
    }
  }

  // --- fromListId (move-only) ---
  if (triggerConfig.fromListId !== undefined) {
    if (triggerType !== "card-moved-to-list") {
      // Present-but-inapplicable filter → no match (stricter option)
      return false;
    }
    if (eventPayload.listIdFrom !== triggerConfig.fromListId) return false;
  }

  // --- labelId ---
  if (triggerConfig.labelId !== undefined) {
    if (eventPayload.labelId !== triggerConfig.labelId) return false;
  }

  // beforeMinutes is intentionally NOT evaluated here — the scheduled-window
  // gate in evaluateRules handles it for due-date-approaching rules.

  return true;
}
