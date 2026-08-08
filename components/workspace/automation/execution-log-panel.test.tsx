import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { getRuleExecutionLogAction } = vi.hoisted(() => ({
  getRuleExecutionLogAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/workspace/ws-1/automation",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions",
  () => ({ getRuleExecutionLogAction }),
);

vi.mock("./rule-descriptors", () => ({
  ACTION_TYPE_LABELS: {
    "move-card-to-list": "Move card to list",
    "set-priority": "Set priority",
    "add-label": "Add label",
  } as Record<string, string>,
  TRIGGER_LABELS: {
    "card-created": "Card is created",
    "card-moved-to-list": "Card is moved to a list",
  } as Record<string, string>,
}));

import { ExecutionLogPanel, type LogEntry } from "./execution-log-panel";

const user = userEvent.setup({ pointerEventsCheck: 0 });

function makeLogs(overrides: Partial<LogEntry>[] = []): LogEntry[] {
  if (overrides.length === 0) return [];
  return overrides.map((o, i) => ({
    id: `log-${i + 1}`,
    ruleId: `rule-${i + 1}`,
    ruleName: `Rule ${i + 1}`,
    chainDepth: 0,
    actionType: "move-card-to-list",
    triggerType: "card-created",
    status: "success",
    error: null,
    executedAt: "2026-07-01T10:00:00.000Z",
    ...o,
  }));
}

function renderPanel(
  props: Partial<Parameters<typeof ExecutionLogPanel>[0]> = {},
) {
  render(
    <ExecutionLogPanel
      workspaceId="ws-1"
      initialLogs={[]}
      notify={vi.fn()}
      {...props}
    />,
  );
}

describe("ExecutionLogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when there are no log entries", () => {
    renderPanel({ initialLogs: [] });

    expect(screen.getByText("No execution logs yet")).toBeInTheDocument();
    expect(
      screen.getByText("Runs appear here as rules fire."),
    ).toBeInTheDocument();
    expect(screen.getByText("Execution log")).toBeInTheDocument();
  });

  it("renders log rows with rule name, status badge, trigger→action label, and timestamp", () => {
    const logs = makeLogs([{ ruleName: "Assign on create", status: "success" }]);
    renderPanel({ initialLogs: logs });

    expect(screen.getByText("Assign on create")).toBeInTheDocument();
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(
      screen.getByText("Card is created → Move card to list"),
    ).toBeInTheDocument();
    // The component formats the date via toLocaleString(); just assert a
    // <time> element exists with the right dateTime attribute.
    expect(screen.getByRole("time")).toBeInTheDocument();
  });

  it("shows log count next to the heading", () => {
    const logs = makeLogs([{}, {}, {}]);
    renderPanel({ initialLogs: logs });

    expect(screen.getByText("Execution log (3)")).toBeInTheDocument();
  });

  it("does not show count when there are no entries", () => {
    renderPanel({ initialLogs: [] });

    expect(screen.getByText("Execution log")).toBeInTheDocument();
    expect(screen.queryByText(/Execution log \(/)).not.toBeInTheDocument();
  });

  it("renders (deleted) badge when ruleId is null", () => {
    const logs = makeLogs([
      { ruleId: null, ruleName: "Old rule", status: "success" },
    ]);
    renderPanel({ initialLogs: logs });

    expect(screen.getByText("Old rule")).toBeInTheDocument();
    expect(screen.getByText("(deleted)")).toBeInTheDocument();
  });

  it("does not show (deleted) when ruleId is present", () => {
    const logs = makeLogs([
      { ruleId: "rule-1", ruleName: "Active rule", status: "success" },
    ]);
    renderPanel({ initialLogs: logs });

    expect(screen.getByText("Active rule")).toBeInTheDocument();
    expect(screen.queryByText("(deleted)")).not.toBeInTheDocument();
  });

  it("renders error status with destructive badge and error message", () => {
    const logs = makeLogs([
      {
        ruleName: "Failing rule",
        status: "error",
        error: "List not found",
      },
    ]);
    renderPanel({ initialLogs: logs });

    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("List not found")).toBeInTheDocument();
  });

  it("renders chain depth when greater than zero", () => {
    const logs = makeLogs([
      { ruleName: "Chained", chainDepth: 3 },
    ]);
    renderPanel({ initialLogs: logs });

    expect(screen.getByText("chain depth 3")).toBeInTheDocument();
  });

  it("does not render chain depth when zero", () => {
    const logs = makeLogs([
      { ruleName: "No chain", chainDepth: 0 },
    ]);
    renderPanel({ initialLogs: logs });

    expect(screen.queryByText(/chain depth/)).not.toBeInTheDocument();
  });

  it("renders multiple log entries", () => {
    const logs = makeLogs([
      { ruleName: "Rule A", status: "success" },
      { ruleName: "Rule B", status: "error", error: "Timeout" },
    ]);
    renderPanel({ initialLogs: logs });

    expect(screen.getByText("Rule A")).toBeInTheDocument();
    expect(screen.getByText("Rule B")).toBeInTheDocument();
    expect(screen.getByText("Timeout")).toBeInTheDocument();
    expect(screen.getByText("Execution log (2)")).toBeInTheDocument();
  });

  describe("refresh", () => {
    it("calls onRefresh when provided", async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      renderPanel({ onRefresh });

      await user.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
      expect(getRuleExecutionLogAction).not.toHaveBeenCalled();
    });

    it("calls getRuleExecutionLogAction when onRefresh is not provided", async () => {
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: [],
      });
      renderPanel({ onRefresh: undefined });

      await user.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() =>
        expect(getRuleExecutionLogAction).toHaveBeenCalledWith({
          workspaceId: "ws-1",
        }),
      );
    });

    it("shows error notify when the action fails", async () => {
      getRuleExecutionLogAction.mockResolvedValue({
        success: false,
        error: "Fetch failed",
      });
      const notify = vi.fn();
      renderPanel({ notify, onRefresh: undefined });

      await user.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() =>
        expect(notify).toHaveBeenCalledWith("Fetch failed", "error"),
      );
    });

    it("disables the button and shows Refreshing... while pending", async () => {
      // Defer resolution so the transition stays pending long enough to observe it.
      let resolveAction: (value: unknown) => void;
      const deferred = new Promise((resolve) => {
        resolveAction = resolve;
      });
      getRuleExecutionLogAction.mockReturnValue(deferred);
      renderPanel({ onRefresh: undefined });

      await user.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Refreshing..." })).toBeDisabled(),
      );

      // Clean up: resolve so the transition can finish.
      resolveAction!({ success: true, hasMore: false, logs: [] });
    });

    it("updates logs after a successful fetch", async () => {
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: makeLogs([
          { ruleName: "Fetched rule", status: "success" },
        ]),
      });
      renderPanel({ initialLogs: [], onRefresh: undefined });

      await user.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() =>
        expect(screen.getByText("Fetched rule")).toBeInTheDocument(),
      );
      expect(screen.getByText("Execution log (1)")).toBeInTheDocument();
    });
  });

  describe("load more (US-066 cursor pagination)", () => {
    it("shows Load more when the initial page is full (100 logs)", () => {
      const logs = makeLogs(Array.from({ length: 100 }, () => ({})));
      renderPanel({ initialLogs: logs });

      expect(
        screen.getByRole("button", { name: "Load more" }),
      ).toBeInTheDocument();
    });

    it("hides Load more when initial logs are under a page", () => {
      const logs = makeLogs([{}, {}]);
      renderPanel({ initialLogs: logs });

      expect(
        screen.queryByRole("button", { name: "Load more" }),
      ).not.toBeInTheDocument();
    });

    it("hides Load more when the panel is host-driven (board modal, onRefresh)", () => {
      const logs = makeLogs(Array.from({ length: 100 }, () => ({})));
      renderPanel({ initialLogs: logs, onRefresh: vi.fn().mockResolvedValue(undefined) });

      expect(
        screen.queryByRole("button", { name: "Load more" }),
      ).not.toBeInTheDocument();
    });

    it("fetches the next page with a cursor (last loaded id) and appends it", async () => {
      const firstPage = makeLogs(
        Array.from({ length: 100 }, (_, i) => ({ id: `log-${i}`, ruleName: `Rule ${i}` })),
      );
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: makeLogs([{ id: "log-100", ruleName: "Older run" }]),
      });
      renderPanel({ initialLogs: firstPage });

      await user.click(screen.getByRole("button", { name: "Load more" }));

      await waitFor(() =>
        expect(getRuleExecutionLogAction).toHaveBeenCalledWith({
          workspaceId: "ws-1",
          cursor: "log-99",
          take: 100,
        }),
      );
      expect(await screen.findByText("Older run")).toBeInTheDocument();
      expect(screen.getByText("Execution log (101)")).toBeInTheDocument();
      // The short batch means the end of the feed → button disappears.
      expect(
        screen.queryByRole("button", { name: "Load more" }),
      ).not.toBeInTheDocument();
    });

    it("keeps Load more visible while a returned batch still fills a page", async () => {
      const firstPage = makeLogs(
        Array.from({ length: 100 }, (_, i) => ({ id: `log-${i}`, ruleName: `Rule ${i}` })),
      );
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: true,
        logs: makeLogs(
          Array.from({ length: 100 }, (_, i) => ({ id: `log-${100 + i}`, ruleName: `Rule ${100 + i}` })),
        ),
      });
      renderPanel({ initialLogs: firstPage });

      await user.click(screen.getByRole("button", { name: "Load more" }));

      await waitFor(() =>
        expect(screen.getByText("Execution log (200)")).toBeInTheDocument(),
      );
      // A full batch may hide more rows → the button stays (wait for the
      // transition to settle so it is no longer showing "Loading...").
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled(),
      );
    });

    it("drops a row whose id is already listed (id dedupe on append)", async () => {
      const firstPage = makeLogs(
        Array.from({ length: 100 }, (_, i) => ({ id: `log-${i}`, ruleName: `Rule ${i}` })),
      );
      // Page 2 would overlap page 1 if the server misbehaved; the panel must
      // not render the duplicate at all (count stays at the first page's).
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: makeLogs([{ id: "log-99", ruleName: "Dup" }]),
      });
      renderPanel({ initialLogs: firstPage });

      await user.click(screen.getByRole("button", { name: "Load more" }));

      await waitFor(() => expect(screen.queryByText("Dup")).not.toBeInTheDocument());
      expect(screen.getByText("Execution log (100)")).toBeInTheDocument();
    });

    it("refresh after load more resets to the first page and its hasMore", async () => {
      const firstPage = makeLogs(
        Array.from({ length: 100 }, (_, i) => ({ id: `log-${i}`, ruleName: `Rule ${i}` })),
      );
      // Page 2 returns a full page → button stays. A later refresh returns the
      // first page with hasMore true → button stays (refreshed, not appended).
      getRuleExecutionLogAction
        .mockResolvedValueOnce({
          success: true,
          hasMore: true,
          logs: makeLogs(
            Array.from({ length: 100 }, (_, i) => ({ id: `log-${100 + i}`, ruleName: `Rule ${100 + i}` })),
          ),
        })
        .mockResolvedValueOnce({
          success: true,
          hasMore: true,
          logs: firstPage,
        });
      renderPanel({ initialLogs: firstPage });

      await user.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() =>
        expect(screen.getByText("Execution log (200)")).toBeInTheDocument(),
      );
      // Let the load-more transition settle before clicking Refresh (both
      // buttons share the pending state).
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled(),
      );

      await user.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() =>
        expect(screen.getByText("Execution log (100)")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled(),
      );
    });
  });

  it("syncs logs when initialLogs prop changes externally", () => {
    const { rerender } = render(
      <ExecutionLogPanel
        workspaceId="ws-1"
        initialLogs={makeLogs([{ ruleName: "First", status: "success" }])}
        notify={vi.fn()}
      />,
    );

    expect(screen.getByText("First")).toBeInTheDocument();

    rerender(
      <ExecutionLogPanel
        workspaceId="ws-1"
        initialLogs={makeLogs([{ ruleName: "Second", status: "error" }])}
        notify={vi.fn()}
      />,
    );

    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});
