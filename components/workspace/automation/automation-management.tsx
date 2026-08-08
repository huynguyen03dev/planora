import { AutomationContent } from "./automation-content";
import type { LogEntry } from "./execution-log-panel";
import { type RuleRowData } from "./rule-row";
import type { AutomationOptions } from "./types";

type AutomationManagementProps = {
  workspaceId: string;
  canManage: boolean;
  rules: RuleRowData[];
  options: AutomationOptions;
  logs: LogEntry[];
  logsHasMore: boolean;
  lastRunByRule: Record<string, { status: string; executedAt: string }>;
};

/**
 * Workspace-level automation page (the cross-board manager). The board-level
 * modal (`BoardAutomationDialog`) renders the same `AutomationContent`; this
 * wrapper only adds the full-page chrome.
 */
export function AutomationManagement({
  workspaceId,
  canManage,
  rules,
  options,
  logs,
  logsHasMore,
  lastRunByRule,
}: AutomationManagementProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Automation</h1>
      <AutomationContent
        workspaceId={workspaceId}
        canManage={canManage}
        rules={rules}
        options={options}
        logs={logs}
        logsHasMore={logsHasMore}
        lastRunByRule={lastRunByRule}
      />
    </main>
  );
}
