import { notFound } from "next/navigation";

import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import db from "@/lib/prisma";
import { getWorkspaceIdBySlug } from "@/lib/workspace";
import { getWorkspaceMembersForManagement } from "@/lib/workspace-members";

import { AutomationManagement } from "@/components/workspace/automation/automation-management";
import type { LogEntry } from "@/components/workspace/automation/execution-log-panel";
import type { RuleRowData } from "@/components/workspace/automation/rule-row";
import type { AutomationOptions } from "@/components/workspace/automation/types";

type AutomationPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AutomationPage({ params }: AutomationPageProps) {
  const { userId } = await verifySession();
  const { slug } = await params;

  // Re-gate at the page even though the layout does (cheap; keeps the page safe
  // if ever reached outside the shell).
  const workspaceRef = await getWorkspaceIdBySlug(slug);
  if (!workspaceRef) {
    notFound();
  }
  const workspaceId = workspaceRef.id;

  if (!(await isWorkspaceMember(userId, workspaceId))) {
    notFound();
  }

  // `organization:update` is admin-exclusive — the single gate for every rule
  // mutation. Reads (this page) are open to any member; the affordances are
  // hidden for non-admins and the Server Actions re-enforce it regardless.
  const canManage = await hasWorkspacePermission(workspaceId, {
    organization: ["update"],
  });

  const [boards, members, rules, logRows, lastRuns] = await Promise.all([
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
      where: { workspaceId },
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
    db.ruleExecutionLog.findMany({
      where: { rule: { workspaceId } },
      orderBy: { executedAt: "desc" },
      take: 100,
      select: {
        id: true,
        ruleId: true,
        chainDepth: true,
        actionType: true,
        triggerType: true,
        status: true,
        error: true,
        executedAt: true,
        rule: { select: { name: true } },
      },
    }),
    // Accurate per-rule last run: one row per rule (its newest execution),
    // independent of how many rows other rules have produced. `distinct` keeps
    // the first row of each ruleId group given the ruleId-then-newest ordering.
    db.ruleExecutionLog.findMany({
      where: { rule: { workspaceId } },
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
    ruleName: log.rule?.name ?? null,
    chainDepth: log.chainDepth,
    actionType: log.actionType,
    triggerType: log.triggerType,
    status: log.status,
    error: log.error,
    executedAt: log.executedAt.toISOString(),
  }));

  const lastRunByRule: Record<string, { status: string; executedAt: string }> = {};
  for (const run of lastRuns) {
    lastRunByRule[run.ruleId] = {
      status: run.status,
      executedAt: run.executedAt.toISOString(),
    };
  }

  return (
    <AutomationManagement
      workspaceId={workspaceId}
      canManage={canManage}
      rules={ruleData}
      options={options}
      logs={logs}
      lastRunByRule={lastRunByRule}
    />
  );
}
