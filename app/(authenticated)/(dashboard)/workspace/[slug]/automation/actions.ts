"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { getBoardById } from "@/lib/board";
import {
  createRuleSchema,
  updateRuleSchema,
  deleteRuleSchema,
  toggleRuleEnabledSchema,
  listRulesSchema,
  ruleExecutionLogSchema,
  dryRunRulesSchema,
  type ActionStep,
} from "@/lib/schemas/automation";
import { evaluateConditions } from "@/lib/automation/matcher";
import {
  detectStaticCycleWarnings,
  type CandidateRule,
} from "@/lib/automation/cycle-check";
import type { RuleEventPayload } from "@/lib/automation/types";

// Gap-based float ordering for rules, consistent with lists/cards.
const RULE_POSITION_GAP = 1024;

// Denials use a not-found posture so we never confirm a workspace/rule exists
// to a caller who cannot manage it (mirrors the members actions).
const WORKSPACE_NOT_FOUND = "Workspace not found";
const RULE_NOT_FOUND = "Rule not found";

// ─── Result types ──────────────────────────────────────────────────

export type SerializedRule = {
  id: string;
  workspaceId: string;
  boardId: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: string;
  triggerConfig: Prisma.JsonValue;
  actions: Prisma.JsonValue;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedRuleLog = {
  id: string;
  ruleId: string;
  ruleName: string | null;
  chainId: string | null;
  chainDepth: number;
  cardId: string | null;
  actionType: string;
  triggerType: string;
  status: string;
  error: string | null;
  executedAt: string;
};

type CreateRuleResult =
  | { success: true; ruleId: string; warnings: string[] }
  | { success: false; error: string };

type UpdateRuleResult =
  | { success: true; warnings: string[] }
  | { success: false; error: string };

type ActionResult = { success: true } | { success: false; error: string };

type ToggleResult =
  | { success: true; enabled: boolean }
  | { success: false; error: string };

type ListRulesResult =
  | { success: true; rules: SerializedRule[] }
  | { success: false; error: string };

type RuleLogResult =
  | { success: true; logs: SerializedRuleLog[] }
  | { success: false; error: string };

type DryRunResult =
  | { success: true; matches: Array<{ ruleId: string; name: string }> }
  | { success: false; error: string };

// ─── Helpers ───────────────────────────────────────────────────────

function firstFieldError(error: {
  flatten(): { fieldErrors: Record<string, string[] | undefined> };
}): string | undefined {
  return Object.values(error.flatten().fieldErrors)[0]?.[0];
}

/** Admin-only gate. `organization:update` is granted to admin exclusively. */
function canManageRules(workspaceId: string): Promise<boolean> {
  return hasWorkspacePermission(workspaceId, { organization: ["update"] });
}

/**
 * Workspace isolation for action-STEP targets. A rule action may reference a
 * `targetListId` (move-card-to-list) or a `labelId` (add/remove-label); the Zod
 * schema only checks these are UUID-shaped. Left unchecked, a workspace admin
 * could author a rule that moves a card into ANOTHER workspace's list or
 * attaches a foreign label — a cross-workspace write at fire time.
 *
 * A list/label's board→workspace binding is immutable in this data model (a
 * board never changes workspace), so validating at SAVE time fully closes the
 * hole — unlike recipient targets, which are workspace-membership-dependent and
 * therefore guarded at RUNTIME in resolver.ts. Returns `true` iff every
 * referenced list/label exists and belongs to `workspaceId`.
 */
async function actionTargetsInWorkspace(
  workspaceId: string,
  actions: ActionStep[],
): Promise<boolean> {
  const listIds = new Set<string>();
  const labelIds = new Set<string>();
  for (const step of actions) {
    if (step.type === "move-card-to-list") listIds.add(step.targetListId);
    else if (step.type === "add-label" || step.type === "remove-label") labelIds.add(step.labelId);
  }

  if (listIds.size > 0) {
    const lists = await db.list.findMany({
      where: { id: { in: [...listIds] } },
      select: { id: true, board: { select: { workspaceId: true } } },
    });
    const inWs = new Set(
      lists.filter((l) => l.board.workspaceId === workspaceId).map((l) => l.id),
    );
    for (const id of listIds) if (!inWs.has(id)) return false;
  }

  if (labelIds.size > 0) {
    const labels = await db.label.findMany({
      where: { id: { in: [...labelIds] } },
      select: { id: true, board: { select: { workspaceId: true } } },
    });
    const inWs = new Set(
      labels.filter((l) => l.board.workspaceId === workspaceId).map((l) => l.id),
    );
    for (const id of labelIds) if (!inWs.has(id)) return false;
  }

  return true;
}

function serializeRule(rule: {
  id: string;
  workspaceId: string;
  boardId: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: string;
  triggerConfig: Prisma.JsonValue;
  actions: Prisma.JsonValue;
  position: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): SerializedRule {
  return {
    ...rule,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

// ─── createRuleAction ──────────────────────────────────────────────

export async function createRuleAction(input: unknown): Promise<CreateRuleResult> {
  const { userId } = await verifySession();

  const parsed = createRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) ?? "Validation failed" };
  }

  const { workspaceId, boardId, name, description, enabled, triggerType, triggerConfig, actions } =
    parsed.data;

  if (!(await canManageRules(workspaceId))) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  // Workspace isolation: a board-scoped rule must reference a board in THIS
  // workspace — never one from another workspace.
  if (boardId) {
    const board = await getBoardById(boardId);
    if (!board || board.workspaceId !== workspaceId) {
      return { success: false, error: "Board not found" };
    }
  }

  if (!(await actionTargetsInWorkspace(workspaceId, actions))) {
    return { success: false, error: "Invalid action target" };
  }

  const workspaceRules = await db.rule.findMany({
    where: { workspaceId },
    select: { id: true, name: true, enabled: true, triggerType: true },
  });
  const warnings = detectStaticCycleWarnings({
    selfTriggerType: triggerType,
    actions,
    workspaceRules: workspaceRules as CandidateRule[],
  });

  const agg = await db.rule.aggregate({
    where: { workspaceId },
    _max: { position: true },
  });
  const position = (agg._max.position ?? 0) + RULE_POSITION_GAP;

  try {
    const rule = await db.rule.create({
      data: {
        workspaceId,
        boardId: boardId ?? null,
        name,
        description: description ?? null,
        enabled: enabled ?? true,
        triggerType,
        triggerConfig: triggerConfig as unknown as Prisma.InputJsonValue,
        actions: actions as unknown as Prisma.InputJsonValue,
        position,
        createdBy: userId,
      },
      select: { id: true },
    });
    revalidatePath("/workspace", "layout");
    return { success: true, ruleId: rule.id, warnings };
  } catch {
    return { success: false, error: "Failed to create rule. Please try again." };
  }
}

// ─── updateRuleAction ──────────────────────────────────────────────

export async function updateRuleAction(input: unknown): Promise<UpdateRuleResult> {
  await verifySession();

  const parsed = updateRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) ?? "Validation failed" };
  }

  const { id, boardId, name, description, enabled, triggerType, triggerConfig, actions } =
    parsed.data;

  // Derive workspaceId from the persisted rule — never trust client input for
  // the isolation scope on an existing resource.
  const existing = await db.rule.findUnique({
    where: { id },
    select: { workspaceId: true },
  });
  if (!existing) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  if (!(await canManageRules(existing.workspaceId))) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  if (boardId) {
    const board = await getBoardById(boardId);
    if (!board || board.workspaceId !== existing.workspaceId) {
      return { success: false, error: "Board not found" };
    }
  }

  if (!(await actionTargetsInWorkspace(existing.workspaceId, actions))) {
    return { success: false, error: "Invalid action target" };
  }

  const workspaceRules = await db.rule.findMany({
    where: { workspaceId: existing.workspaceId },
    select: { id: true, name: true, enabled: true, triggerType: true },
  });
  const warnings = detectStaticCycleWarnings({
    selfId: id,
    selfTriggerType: triggerType,
    actions,
    workspaceRules: workspaceRules as CandidateRule[],
  });

  try {
    await db.rule.update({
      where: { id },
      data: {
        boardId: boardId ?? null,
        name,
        description: description ?? null,
        ...(enabled !== undefined ? { enabled } : {}),
        triggerType,
        triggerConfig: triggerConfig as unknown as Prisma.InputJsonValue,
        actions: actions as unknown as Prisma.InputJsonValue,
      },
    });
    revalidatePath("/workspace", "layout");
    return { success: true, warnings };
  } catch {
    return { success: false, error: "Failed to update rule. Please try again." };
  }
}

// ─── deleteRuleAction ──────────────────────────────────────────────

export async function deleteRuleAction(input: unknown): Promise<ActionResult> {
  await verifySession();

  const parsed = deleteRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  const { id } = parsed.data;

  const existing = await db.rule.findUnique({
    where: { id },
    select: { workspaceId: true },
  });
  if (!existing) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  if (!(await canManageRules(existing.workspaceId))) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  try {
    await db.rule.delete({ where: { id } });
    revalidatePath("/workspace", "layout");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete rule. Please try again." };
  }
}

// ─── toggleRuleEnabledAction ───────────────────────────────────────

export async function toggleRuleEnabledAction(input: unknown): Promise<ToggleResult> {
  await verifySession();

  const parsed = toggleRuleEnabledSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  const { id, enabled } = parsed.data;

  const existing = await db.rule.findUnique({
    where: { id },
    select: { workspaceId: true },
  });
  if (!existing) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  if (!(await canManageRules(existing.workspaceId))) {
    return { success: false, error: RULE_NOT_FOUND };
  }

  try {
    await db.rule.update({ where: { id }, data: { enabled } });
    revalidatePath("/workspace", "layout");
    return { success: true, enabled };
  } catch {
    return { success: false, error: "Failed to update rule. Please try again." };
  }
}

// ─── listRulesAction (any workspace member) ────────────────────────

export async function listRulesAction(input: unknown): Promise<ListRulesResult> {
  const { userId } = await verifySession();

  const parsed = listRulesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  const { workspaceId } = parsed.data;

  if (!(await isWorkspaceMember(userId, workspaceId))) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  const rules = await db.rule.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      workspaceId: true,
      boardId: true,
      name: true,
      description: true,
      enabled: true,
      triggerType: true,
      triggerConfig: true,
      actions: true,
      position: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { success: true, rules: rules.map(serializeRule) };
}

// ─── getRuleExecutionLogAction (any workspace member) ──────────────

export async function getRuleExecutionLogAction(input: unknown): Promise<RuleLogResult> {
  const { userId } = await verifySession();

  const parsed = ruleExecutionLogSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  const { workspaceId, ruleId } = parsed.data;

  if (!(await isWorkspaceMember(userId, workspaceId))) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  const logs = await db.ruleExecutionLog.findMany({
    // Scope by the parent rule's workspace — logs carry no workspaceId of their
    // own, so the workspace filter must ride the relation (isolation).
    where: { rule: { workspaceId }, ...(ruleId ? { ruleId } : {}) },
    orderBy: { executedAt: "desc" },
    take: 100,
    select: {
      id: true,
      ruleId: true,
      chainId: true,
      chainDepth: true,
      cardId: true,
      actionType: true,
      triggerType: true,
      status: true,
      error: true,
      executedAt: true,
      rule: { select: { name: true } },
    },
  });

  return {
    success: true,
    logs: logs.map((log) => ({
      id: log.id,
      ruleId: log.ruleId,
      ruleName: log.rule?.name ?? null,
      chainId: log.chainId,
      chainDepth: log.chainDepth,
      cardId: log.cardId,
      actionType: log.actionType,
      triggerType: log.triggerType,
      status: log.status,
      error: log.error,
      executedAt: log.executedAt.toISOString(),
    })),
  };
}

// ─── dryRunRulesAction (any workspace member; no mutation) ─────────

export async function dryRunRulesAction(input: unknown): Promise<DryRunResult> {
  const { userId } = await verifySession();

  const parsed = dryRunRulesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) ?? "Validation failed" };
  }

  const { workspaceId, triggerType, event } = parsed.data;

  if (!(await isWorkspaceMember(userId, workspaceId))) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  // Read-only: fetch enabled rules for this trigger and run the PURE matcher.
  // No transaction, no executor, no writes.
  const rules = await db.rule.findMany({
    where: { workspaceId, triggerType, enabled: true },
    select: { id: true, name: true, triggerType: true, triggerConfig: true },
  });

  const payload = event as RuleEventPayload;
  const matches: Array<{ ruleId: string; name: string }> = [];
  for (const rule of rules) {
    // The query already filters by triggerType, so only conditions remain.
    const config = (rule.triggerConfig ?? {}) as Parameters<typeof evaluateConditions>[1];
    if (evaluateConditions(triggerType, config, payload)) {
      matches.push({ ruleId: rule.id, name: rule.name });
    }
  }

  return { success: true, matches };
}
