import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { toggleRuleEnabledAction, deleteRuleAction, refresh } = vi.hoisted(() => ({
  toggleRuleEnabledAction: vi.fn(),
  deleteRuleAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions",
  () => ({ toggleRuleEnabledAction, deleteRuleAction }),
);

// Heavy child dialog — stubbed so mounting doesn't drag in its own action imports.
vi.mock("./rule-builder-dialog", () => ({
  RuleBuilderDialog: () => null,
}));

// Descriptors are pure UI; stub them to return simple markers so assertions are
// about the row's own behaviour, not the descriptor formatting.
vi.mock("./rule-descriptors", () => ({
  summarizeTrigger: () => "trigger-summary",
  summarizeActions: () => "action-summary",
}));

import { RuleRow, type RuleRowData } from "./rule-row";
import type { AutomationOptions, NotifyFn } from "./types";

const user = userEvent.setup({ pointerEventsCheck: 0 });

const OPTIONS: AutomationOptions = {
  boards: [{ id: "board-1", title: "Board One" }],
  lists: [{ id: "list-1", title: "To Do", boardId: "board-1", boardTitle: "Board One" }],
  labels: [
    { id: "label-1", name: "Bug", color: "red", boardId: "board-1", boardTitle: "Board One" },
  ],
  members: [{ userId: "user-1", name: "Alice" }],
};

const LOOKUPS = {
  board: (_id: string | null | undefined) => String(_id ?? ""),
  list: (_id: string | null | undefined) => String(_id ?? ""),
  label: (_id: string | null | undefined) => String(_id ?? ""),
  member: (_id: string | null | undefined) => String(_id ?? ""),
};

function makeRule(overrides: Partial<RuleRowData> = {}): RuleRowData {
  return {
    id: "rule-1",
    name: "Set priority on create",
    description: null,
    enabled: true,
    boardId: "board-1",
    boardTitle: "Board One",
    triggerType: "card-created" as RuleRowData["triggerType"],
    triggerConfig: {},
    actions: [],
    ...overrides,
  };
}

function renderRow(
  overrides: Partial<Parameters<typeof RuleRow>[0]> = {},
) {
  const props = {
    workspaceId: "ws-1",
    rule: makeRule(),
    options: OPTIONS,
    lookups: LOOKUPS,
    canManage: true,
    lastRun: null,
    notify: vi.fn() as NotifyFn,
    ...overrides,
  };
  render(<RuleRow {...props} />);
  return props;
}

describe("RuleRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the rule name and board title", () => {
    renderRow({ rule: makeRule({ name: "Auto-label bugs", boardTitle: "Sprint" }) });

    expect(screen.getByText("Auto-label bugs")).toBeInTheDocument();
    expect(screen.getByText("Sprint")).toBeInTheDocument();
  });

  it("renders when/trigger and then/actions summaries", () => {
    renderRow();

    expect(screen.getByText("trigger-summary")).toBeInTheDocument();
    expect(screen.getByText("action-summary")).toBeInTheDocument();
  });

  it("shows no Disabled badge when the rule is enabled", () => {
    renderRow({ rule: makeRule({ enabled: true }) });

    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
  });

  it("shows a Disabled badge when the rule is disabled", () => {
    renderRow({ rule: makeRule({ enabled: false }) });

    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("toggles from enabled to disabled and calls the Server Action", async () => {
    toggleRuleEnabledAction.mockResolvedValue({ success: true });
    renderRow({ rule: makeRule({ enabled: true }) });

    const toggle = screen.getByRole("switch", { name: "Disable rule" });
    await user.click(toggle);

    await waitFor(() => {
      expect(toggleRuleEnabledAction).toHaveBeenCalledWith({ id: "rule-1", enabled: false });
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("toggles from disabled to enabled and calls the Server Action", async () => {
    toggleRuleEnabledAction.mockResolvedValue({ success: true });
    renderRow({ rule: makeRule({ enabled: false }) });

    const toggle = screen.getByRole("switch", { name: "Enable rule" });
    await user.click(toggle);

    await waitFor(() => {
      expect(toggleRuleEnabledAction).toHaveBeenCalledWith({ id: "rule-1", enabled: true });
    });
  });

  it("notifies on toggle error", async () => {
    toggleRuleEnabledAction.mockResolvedValue({ success: false, error: "Toggle failed" });
    const notify = vi.fn();
    renderRow({ notify });

    await user.click(screen.getByRole("switch", { name: "Disable rule" }));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Toggle failed", "error");
    });
  });

  it("opens the delete confirmation dialog", async () => {
    renderRow();

    await user.click(screen.getByRole("button", { name: /Delete/ }));

    expect(screen.getByText("Delete this rule?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete rule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("cancelling the delete dialog dismisses without calling the action", async () => {
    renderRow();

    await user.click(screen.getByRole("button", { name: /Delete/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteRuleAction).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("Delete this rule?")).not.toBeInTheDocument();
    });
  });

  it("confirming delete calls deleteRuleAction and notifies", async () => {
    deleteRuleAction.mockResolvedValue({ success: true });
    const notify = vi.fn();
    renderRow({ notify });

    await user.click(screen.getByRole("button", { name: /Delete/ }));
    await user.click(screen.getByRole("button", { name: "Delete rule" }));

    await waitFor(() => {
      expect(deleteRuleAction).toHaveBeenCalledWith({ id: "rule-1" });
    });
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Rule deleted", "info");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows error and keeps dialog open on delete failure", async () => {
    deleteRuleAction.mockResolvedValue({ success: false, error: "Delete failed" });
    const notify = vi.fn();
    renderRow({ notify });

    await user.click(screen.getByRole("button", { name: /Delete/ }));
    await user.click(screen.getByRole("button", { name: "Delete rule" }));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Delete failed", "error");
    });
    // Dialog stays open — the rule name is still visible inside it.
    expect(screen.getByText("Delete this rule?")).toBeInTheDocument();
  });

  it("disables the toggle when canManage is false", () => {
    renderRow({ canManage: false });

    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("hides edit and delete buttons when canManage is false", () => {
    renderRow({ canManage: false });

    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("shows 'Never run' when lastRun is null", () => {
    renderRow({ lastRun: null });

    expect(screen.getByText("Never run")).toBeInTheDocument();
  });

  it("shows last run status and timestamp when lastRun is provided", () => {
    renderRow({
      lastRun: { status: "success", executedAt: "2026-07-01T12:00:00Z" },
    });

    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("calls onMutated after a successful toggle", async () => {
    toggleRuleEnabledAction.mockResolvedValue({ success: true });
    const onMutated = vi.fn();
    renderRow({ onMutated });

    await user.click(screen.getByRole("switch", { name: "Disable rule" }));

    await waitFor(() => {
      expect(onMutated).toHaveBeenCalled();
    });
  });
});
