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
  // Internal (not user-supplied) — chain loop-prevention metadata
  _chainId?: string;
  _chainDepth?: number;
}

// ─── Re-exports from schema (convenience) ───────────────────────────

export type { TriggerType, TriggerConfig };
