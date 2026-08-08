// Shared automation-view loader (US-067). Both the workspace-level automation
// page and the board-level automation modal render the same rules/log surface;
// this is the single query+shape source of truth for that surface.
//
// The `boardId` option scopes the view to one board: rules are filtered to
// `boardId ∈ {board, null}` (a workspace-wide rule with null boardId fires on
// every board, so it belongs in each board's view too), and the execution log
// is filtered to the shown rules. With no `boardId`, the full workspace view is
// returned (the workspace page), unchanged from before the extraction.

import db from "@/lib/prisma";
import { getWorkspaceMembersForManagement } from "@/lib/workspace-members";

import type { LogEntry } from "@/components/workspace/automation/execution-log-panel";
import type { RuleRowData } from "@/components/workspace/automation/rule-row";
import type { AutomationOptions } from "@/components/workspace/automation/types";

export type AutomationView = {
  options: AutomationOptions;
  rules: RuleRowData[];
  logs: LogEntry[];
  lastRunByRule: Record<string, { status: string; executedAt: string }>;
};

export async function loadAutomationView(
  workspaceId: string,
  opts: { boardId?: string; cursor?: string; take?: number } = {},
): Promise<AutomationView> {
  const { boardId, cursor, take } = opts;
  // US-066 cursor pagination: `cursor` = id of the last log of the previous
  // page; `take` overrides the default page size (100). Omitting both keeps the
  // legacy behavior (the 100 newest logs).
  const pageSize = take ?? 100;

  const ruleWhere = boardId
    ? { workspaceId, OR: [{ boardId }, { boardId: null }] }
    : { workspaceId };

  const [boards, members, rules] = await Promise.all([
    db.board.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        lists: { orderBy: { position: "asc" }, select: { id: true, title: true } },
        labels: { orderBy: { name: "asc" }, select: { id: true, name: true, color: true } },
      },
    }),
    getWorkspaceMembersForManagement(workspaceId),
    db.rule.findMany({
      where: ruleWhere,
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        enabled: true,
        boardId: true,
        triggerType: true,
        triggerConfig: true,
        actions: true,
        board: { select: { title: true } },
      },
    }),
  ]);

  // Board-scoped view: the log follows the shown rules only (an `in: []` on an
  // empty rule set correctly returns no rows, and naturally excludes orphaned
  // ruleId-null logs, which have no board to belong to). Workspace view: all.
  const logWhere = boardId
    ? { workspaceId, ruleId: { in: rules.map((r) => r.id) } }
    : { workspaceId };

  const [logRows, lastRuns] = await Promise.all([
    db.ruleExecutionLog.findMany({
      where: logWhere,
      // executedAt desc with an id tiebreak keeps cursor pages deterministic.
      orderBy: [{ executedAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: pageSize,
      select: {
        id: true,
        ruleId: true,
        ruleName: true,
        chainDepth: true,
        actionType: true,
        triggerType: true,
        status: true,
        error: true,
        executedAt: true,
      },
    }),
    // Accurate per-rule last run: one row per rule (its newest execution).
    // `distinct` keeps the first row of each ruleId group given the
    // ruleId-then-newest ordering.
    db.ruleExecutionLog.findMany({
      where: logWhere,
      orderBy: [{ ruleId: "asc" }, { executedAt: "desc" }],
      distinct: ["ruleId"],
      select: { ruleId: true, status: true, executedAt: true },
    }),
  ]);

  const options: AutomationOptions = {
    boards: boards.map((b) => ({ id: b.id, title: b.title })),
    lists: boards.flatMap((b) =>
      b.lists.map((l) => ({ id: l.id, title: l.title, boardId: b.id, boardTitle: b.title })),
    ),
    labels: boards.flatMap((b) =>
      b.labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        boardId: b.id,
        boardTitle: b.title,
      })),
    ),
    members: members.map((m) => ({ userId: m.userId, name: m.name })),
  };

  const ruleData: RuleRowData[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    boardId: rule.boardId,
    triggerType: rule.triggerType,
    triggerConfig: rule.triggerConfig,
    actions: rule.actions,
    boardTitle: rule.board?.title ?? null,
  }));

  const logs: LogEntry[] = logRows.map((log) => ({
    id: log.id,
    ruleId: log.ruleId,
    ruleName: log.ruleName,
    chainDepth: log.chainDepth,
    actionType: log.actionType,
    triggerType: log.triggerType,
    status: log.status,
    error: log.error,
    executedAt: log.executedAt.toISOString(),
  }));

  const lastRunByRule: Record<string, { status: string; executedAt: string }> = {};
  for (const run of lastRuns) {
    // Orphaned logs (ruleId null after the rule was deleted) have no rule row to
    // annotate — skip them here; they still appear in the execution-log panel.
    if (!run.ruleId) continue;
    lastRunByRule[run.ruleId] = {
      status: run.status,
      executedAt: run.executedAt.toISOString(),
    };
  }

  return { options, rules: ruleData, logs, lastRunByRule };
}
