/**
 * Shared types for the automation engine.
 *
 * Re-exports TriggerType and TriggerConfig from the Zod schema for convenience,
 * and defines the pure-logic types (ActionType, RuleEventPayload) that the
 * matcher, executor, and evaluator modules share.
 */

import type { TriggerType, TriggerConfig } from "@/lib/schemas/automation";

// ─── Action types (one per action-step `type` discriminator) ─────────

export const ACTION_TYPES = [
  "move-card-to-list",
  "set-priority",
  "add-label",
  "remove-label",
  "assign-member",
  "remove-member",
  "set-completion",
  "notify-member",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

// ─── Priority (matches Prisma enum; local literal union to avoid
//     importing generated client into pure-logic code) ────────────────

export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

// ─── RuleEventPayload ───────────────────────────────────────────────
// Matches the design.md "### RuleEventPayload" block exactly, plus an
// optional `priority` field so the matcher can evaluate priority
// conditions against the card's current priority at trigger time.
// (Design note: the base payload doesn't carry priority; adding it here
// is a deviation documented in the US-066 implementation notes.)

export interface RuleEventPayload {
  cardId?: string;
  boardId?: string;
  listId?: string;
  listIdFrom?: string;
  listIdTo?: string;
  labelId?: string;
  memberId?: string;
  completed?: boolean;
  priority?: Priority;
  // Scheduled-path-only fields (set by the cron evaluator for due-date-approaching rules).
  // Card-triggered paths never set them, keeping Phase 6 behavior byte-identical.
  dueDate?: string;   // ISO string — the card's dueDate at trigger time
  now?: string;        // ISO string — the current time at trigger time
  // Internal (not user-supplied) — chain loop-prevention metadata
  _chainId?: string;
  _chainDepth?: number;
}

// ─── RuleExecutionError ───────────────────────────────────────────
// Shared error class thrown when a rule action fails inside the trigger
// transaction. Two-class taxonomy (decision 0030):
//
//  1. Expected/stale-target class — carries a structured `code`
//     (STALE_TARGET_CODES). The executor catches these per-step INSIDE the
//     shared tx, records them in RuleExecutionLog.metadata, and continues
//     with the next independent action step (best-effort). The primary
//     mutation commits.
//  2. Unexpected/systemic class — no `code` (or non-RuleExecutionError).
//     These propagate and abort the shared tx; the Server Action rolls back
//     and writes the error RuleExecutionLog row post-rollback via
//     logRuleExecutionError.
//
// Defined here (not in evaluator.ts) so both evaluator.ts and executor.ts
// can throw/catch it without a circular dependency.

/** Structured stale-target codes (decision 0030, US-075). */
export const STALE_TARGET_CODES = {
  TARGET_LIST_NOT_FOUND: "TARGET_LIST_NOT_FOUND",
  TARGET_LIST_ARCHIVED: "TARGET_LIST_ARCHIVED",
  TARGET_LIST_FOREIGN_WORKSPACE: "TARGET_LIST_FOREIGN_WORKSPACE",
  MEMBER_NOT_IN_WORKSPACE: "MEMBER_NOT_IN_WORKSPACE",
  LABEL_NOT_FOUND: "LABEL_NOT_FOUND",
} as const;

export type StaleTargetCode = (typeof STALE_TARGET_CODES)[keyof typeof STALE_TARGET_CODES];

export class RuleExecutionError extends Error {
  readonly context: {
    workspaceId: string;
    ruleId: string;
    ruleName: string;
    chainId: string;
    chainDepth: number;
    cardId: string | null;
    triggerType: TriggerType;
    cause: unknown;
  };

  /** Structured stale-target code (decision 0030); absent for unexpected errors. */
  readonly code?: StaleTargetCode;

  constructor(message: string, context: RuleExecutionError["context"], code?: StaleTargetCode) {
    super(message);
    this.name = "RuleExecutionError";
    this.context = context;
    this.code = code;
  }
}

// ─── Re-exports from schema (convenience) ───────────────────────────

export type { TriggerType, TriggerConfig };
