import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AutomationOptions } from "./types";

// Stub heavy child modules to simple controlled components so we test only
// AutomationContent's own composition/branching, not their internals.
vi.mock("./rule-row", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RuleRow: (props: any) => (
    <div data-testid="rule-row">{props.rule.name}</div>
  ),
}));

vi.mock("./rule-builder-dialog", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RuleBuilderDialog: (props: any) => (
    <span data-testid="rule-builder-dialog">{props.trigger}</span>
  ),
}));

vi.mock("./execution-log-panel", () => ({
  ExecutionLogPanel: () => <div data-testid="execution-log-panel">Execution log panel</div>,
}));

import { AutomationContent } from "./automation-content";

const OPTIONS: AutomationOptions = {
  boards: [{ id: "board-1", title: "Board One" }],
  lists: [{ id: "list-1", title: "To Do", boardId: "board-1", boardTitle: "Board One" }],
  labels: [{ id: "label-1", name: "Bug", color: "red", boardId: "board-1", boardTitle: "Board One" }],
  members: [{ userId: "user-1", name: "Alice" }],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rule(overrides: Record<string, any> = {}) {
  return {
    id: "rule-1",
    name: "Auto-label bugs",
    description: null,
    enabled: true,
    boardId: null,
    triggerType: "card-created",
    triggerConfig: {},
    actions: [],
    boardTitle: null,
    ...overrides,
  };
}

function log() {
  return {
    id: "log-1",
    ruleId: "rule-1",
    ruleName: "Auto-label bugs",
    chainDepth: 0,
    actionType: "set-labels",
    triggerType: "card-created",
    status: "success",
    error: null,
    executedAt: new Date().toISOString(),
  };
}

describe("AutomationContent", () => {
  // ---------------------------------------------------------------------------
  // Rule count & header
  // ---------------------------------------------------------------------------
  it("shows the rule count with singular label", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[rule()]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(screen.getByText(/1 rule/)).toBeInTheDocument();
  });

  it("shows the plural label when there are multiple rules", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[rule({ id: "r1" }), rule({ id: "r2" })]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(screen.getByText(/2 rules/)).toBeInTheDocument();
  });

  it("shows the admin blurb when canManage is true", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[rule()]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(
      screen.getByText(/rules run automatically when their trigger fires/),
    ).toBeInTheDocument();
  });

  it("shows the viewer blurb when canManage is false", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage={false}
        rules={[rule()]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(
      screen.getByText(/only workspace admins can manage rules/),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // New-rule CTA (canManage gate)
  // ---------------------------------------------------------------------------
  it("shows the New rule button when the user can manage", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[rule()]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    // The stubbed RuleBuilderDialog renders its trigger; the trigger is a
    // <Button> with text "New rule".
    expect(screen.getByRole("button", { name: "New rule" })).toBeInTheDocument();
  });

  it("hides the New rule button when the user cannot manage", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage={false}
        rules={[rule()]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(screen.queryByRole("button", { name: "New rule" })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  it("shows the empty-state message when there are no rules", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(screen.getByText("No automation rules yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Create a rule to run actions automatically/),
    ).toBeInTheDocument();
  });

  it("shows the empty-state CTA when canManage is true", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    // The New rule button is still rendered in the header above the empty state.
    expect(screen.getByRole("button", { name: "New rule" })).toBeInTheDocument();
  });

  it("shows viewer text in the empty state when canManage is false", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage={false}
        rules={[]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(screen.getByText("No automation rules yet")).toBeInTheDocument();
    expect(
      screen.getByText(/A workspace admin can create rules/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New rule" })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Rule list rendering
  // ---------------------------------------------------------------------------
  it("renders a rule row for each rule", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[rule({ id: "r1", name: "Rule A" }), rule({ id: "r2", name: "Rule B" })]}
        options={OPTIONS}
        logs={[]}
        lastRunByRule={{}}
      />,
    );

    expect(screen.getByText("Rule A")).toBeInTheDocument();
    expect(screen.getByText("Rule B")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Execution log panel
  // ---------------------------------------------------------------------------
  it("renders the execution-log panel", () => {
    render(
      <AutomationContent
        workspaceId="ws-1"
        canManage
        rules={[rule()]}
        options={OPTIONS}
        logs={[log()]}
        lastRunByRule={{}}
      />,
    );

    expect(screen.getByTestId("execution-log-panel")).toBeInTheDocument();
  });
});
