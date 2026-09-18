import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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

/**
 * Test double for IntersectionObserver: installed via vi.stubGlobal inside
 * the infinite-scroll suite. Every observer created by the component is
 * recorded (instances, with the options it was built with) and each test
 * drives intersections manually — proving the sentinel trigger and the
 * scroll-container root without a layout engine. `disconnected` mirrors the
 * component's cleanup contract: an in-flight load, an error, or the end of
 * data must tear the observer down so auto-load can never double-fire.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;
  readonly elements = new Set<Element>();
  disconnected = false;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.disconnected = true;
    this.elements.clear();
  }

  /** Test driver: fire an intersection (or non-intersection) for every
   * element currently observed, exactly like the real observer would. */
  fire(intersecting: boolean) {
    const entries = [...this.elements].map(
      (element) =>
        ({
          isIntersecting: intersecting,
          target: element,
        }) as IntersectionObserverEntry,
    );
    this.callback(
      entries as unknown as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}

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
      initialHasMore={false}
      notify={vi.fn()}
      {...props}
    />,
  );
}

/** The component's most recently created observer (the active one). */
function currentObserver() {
  const observer = FakeIntersectionObserver.instances.at(-1);
  expect(observer).toBeDefined();
  return observer!;
}

describe("ExecutionLogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

    it("calls getRuleExecutionLogAction for a fresh first batch when onRefresh is not provided", async () => {
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
          take: 30,
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
      await act(async () => {
        resolveAction!({ success: true, hasMore: false, logs: [] });
      });
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

  describe("infinite scroll (US-066, workspace page)", () => {
    function fullFirstPage(): LogEntry[] {
      return makeLogs(
        Array.from({ length: 30 }, (_, i) => ({ id: `log-${i}`, ruleName: `Rule ${i}` })),
      );
    }

    it("observes the end sentinel against the scroll container with a lookahead, only when the server reports more", () => {
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: true });

      const observer = currentObserver();
      expect(observer.options?.root).toBeDefined();
      expect(observer.options?.rootMargin).toBe("0px 0px 240px 0px");

      // The observed sentinel lives INSIDE the bounded scroll container — the
      // observer root — so auto-load only fires as the feed itself scrolls.
      const sentinel = [...observer.elements][0];
      expect(observer.options?.root).toBe(sentinel.parentElement);
    });

    it("creates no observer when the initial page is complete (hasMore=false)", () => {
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: false });

      expect(FakeIntersectionObserver.instances.length).toBe(0);
      expect(
        screen.getByText("All execution logs are shown"),
      ).toBeInTheDocument();
    });

    it("fetches the next batch behind the last loaded log and appends it", async () => {
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: makeLogs([{ id: "log-30", ruleName: "Older run" }]),
      });
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: true });

      act(() => currentObserver().fire(true));

      await waitFor(() =>
        expect(getRuleExecutionLogAction).toHaveBeenCalledWith({
          workspaceId: "ws-1",
          cursor: "log-29",
          take: 30,
        }),
      );
      expect(await screen.findByText("Older run")).toBeInTheDocument();
      expect(screen.getByText("Execution log (31)")).toBeInTheDocument();
      // The short batch means the end of the feed → terminal status.
      expect(
        screen.getByText("All execution logs are shown"),
      ).toBeInTheDocument();
    });

    it("keeps the sentinel alive while a returned batch still fills a page", async () => {
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: true,
        logs: makeLogs(
          Array.from({ length: 30 }, (_, i) => ({ id: `log-${30 + i}`, ruleName: `Rule ${30 + i}` })),
        ),
      });
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: true });

      act(() => currentObserver().fire(true));

      await waitFor(() =>
        expect(screen.getByText("Execution log (60)")).toBeInTheDocument(),
      );
      // A full batch may hide more rows → a fresh observer re-arms the sentinel.
      await waitFor(() =>
        expect(FakeIntersectionObserver.instances.length).toBe(2),
      );
      expect(FakeIntersectionObserver.instances[1].disconnected).toBe(false);
      // No terminal status while more may exist.
      expect(
        screen.queryByText("All execution logs are shown"),
      ).not.toBeInTheDocument();
    });

    it("drops a row whose id is already listed (id dedupe on append)", async () => {
      const firstPage = fullFirstPage();
      // Page 2 would overlap page 1 if the server misbehaved; the panel must
      // not render the duplicate at all (count stays at the first page's).
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: makeLogs([{ id: "log-29", ruleName: "Dup" }]),
      });
      renderPanel({ initialLogs: firstPage, initialHasMore: true });

      act(() => currentObserver().fire(true));

      await waitFor(() => expect(screen.queryByText("Dup")).not.toBeInTheDocument());
      expect(screen.getByText("Execution log (30)")).toBeInTheDocument();
    });

    it("is single-flight: two intersections in the same tick fire one request", async () => {
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: makeLogs([{ id: "log-30", ruleName: "Older run" }]),
      });
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: true });

      const observer = currentObserver();
      act(() => {
        observer.fire(true);
        observer.fire(true);
      });

      await waitFor(() =>
        expect(getRuleExecutionLogAction).toHaveBeenCalledTimes(1),
      );
    });

    it("shows a muted loading status while a batch is in flight", async () => {
      let resolveAction: (value: unknown) => void;
      const deferred = new Promise((resolve) => {
        resolveAction = resolve;
      });
      getRuleExecutionLogAction.mockReturnValue(deferred);
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: true });

      act(() => currentObserver().fire(true));

      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent("Loading more logs…");

      // Clean up so the suite's pending timers/promises don't leak.
      await act(async () => {
        resolveAction!({ success: true, hasMore: false, logs: [] });
      });
    });

    it("shows the action's error with a low-emphasis retry; retry re-fetches and appends", async () => {
      getRuleExecutionLogAction
        .mockResolvedValueOnce({ success: false, error: "Batch failed" })
        .mockResolvedValueOnce({
          success: true,
          hasMore: false,
          logs: makeLogs([{ id: "log-30", ruleName: "Recovered run" }]),
        });
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: true });

      act(() => currentObserver().fire(true));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Batch failed");
      const retry = screen.getByRole("button", { name: "Load more" });
      await user.click(retry);

      await waitFor(() =>
        expect(getRuleExecutionLogAction).toHaveBeenCalledTimes(2),
      );
      expect(await screen.findByText("Recovered run")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Load more" }),
      ).not.toBeInTheDocument();
    });

    it("falls back to a standing manual affordance when IntersectionObserver is unavailable", async () => {
      vi.stubGlobal("IntersectionObserver", undefined);
      getRuleExecutionLogAction.mockResolvedValue({
        success: true,
        hasMore: false,
        logs: makeLogs([{ id: "log-30", ruleName: "Manual run" }]),
      });
      renderPanel({ initialLogs: fullFirstPage(), initialHasMore: true });

      expect(FakeIntersectionObserver.instances.length).toBe(0);
      const loadMore = screen.getByRole("button", { name: "Load more" });
      await user.click(loadMore);

      await waitFor(() =>
        expect(getRuleExecutionLogAction).toHaveBeenCalledWith({
          workspaceId: "ws-1",
          cursor: "log-29",
          take: 30,
        }),
      );
      expect(await screen.findByText("Manual run")).toBeInTheDocument();
    });

    it("refresh while a batch is in flight discards the stale append (generation guard)", async () => {
      const firstPage = fullFirstPage();
      let resolveBatch: (value: unknown) => void;
      const batchDeferred = new Promise((resolve) => {
        resolveBatch = resolve;
      });
      getRuleExecutionLogAction
        .mockReturnValueOnce(batchDeferred)
        .mockResolvedValueOnce({
          success: true,
          hasMore: true,
          logs: firstPage,
        });
      renderPanel({ initialLogs: firstPage, initialHasMore: true });

      // Batch starts (hangs) …
      act(() => currentObserver().fire(true));
      await waitFor(() => expect(getRuleExecutionLogAction).toHaveBeenCalledTimes(1));

      // … then a refresh supersedes it with a fresh first page.
      await user.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() =>
        expect(screen.getByText("Execution log (30)")).toBeInTheDocument(),
      );

      // The stale batch finally lands with page-2 rows — they must NOT append.
      act(() => resolveBatch!({
        success: true,
        hasMore: false,
        logs: makeLogs(
          Array.from({ length: 30 }, (_, i) => ({ id: `log-${30 + i}`, ruleName: `Stale ${i}` })),
        ),
      }));
      // The in-flight loading status clears only once the stale batch has been
      // processed — that is the sync point for the discard assertion below.
      await waitFor(() =>
        expect(screen.queryByText("Loading more logs…")).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(screen.queryByText(/Stale/)).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Execution log (30)")).toBeInTheDocument();
    });

    it("refresh after load more resets to the first page and its hasMore", async () => {
      const firstPage = fullFirstPage();
      getRuleExecutionLogAction
        .mockResolvedValueOnce({
          success: true,
          hasMore: true,
          logs: makeLogs(
            Array.from({ length: 30 }, (_, i) => ({ id: `log-${30 + i}`, ruleName: `Rule ${30 + i}` })),
          ),
        })
        .mockResolvedValueOnce({
          success: true,
          hasMore: true,
          logs: firstPage,
        });
      renderPanel({ initialLogs: firstPage, initialHasMore: true });

      act(() => currentObserver().fire(true));
      await waitFor(() =>
        expect(screen.getByText("Execution log (60)")).toBeInTheDocument(),
      );
      // Let the batch settle before clicking Refresh (the feed re-arms its
      // sentinel after the append).
      await waitFor(() =>
        expect(FakeIntersectionObserver.instances.length).toBe(2),
      );

      await user.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() =>
        expect(screen.getByText("Execution log (30)")).toBeInTheDocument(),
      );
      // The refresh returned a full page with hasMore → the sentinel re-arms.
      await waitFor(() =>
        expect(FakeIntersectionObserver.instances.length).toBe(3),
      );
      expect(FakeIntersectionObserver.instances[2].disconnected).toBe(false);
    });
  });

  describe("board modal (host-driven, onRefresh)", () => {
    it("shows an honest 'latest only' note when more history exists, and pages nothing", () => {
      renderPanel({
        initialLogs: makeLogs([{}, {}, {}]),
        initialHasMore: true,
        onRefresh: vi.fn().mockResolvedValue(undefined),
      });

      expect(
        screen.getByText(/Showing the latest logs/),
      ).toBeInTheDocument();
      // The modal cannot cursor-page through its host fetch → no sentinel, no
      // Load more affordance, no observer.
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
      expect(FakeIntersectionObserver.instances.length).toBe(0);
    });

    it("shows no note when all history is present (hasMore=false)", () => {
      renderPanel({
        initialLogs: makeLogs([{}, {}, {}]),
        initialHasMore: false,
        onRefresh: vi.fn().mockResolvedValue(undefined),
      });

      expect(
        screen.queryByText(/Showing the latest logs/),
      ).not.toBeInTheDocument();
      expect(FakeIntersectionObserver.instances.length).toBe(0);
    });

    it("never fetches the next batch through the paging action", async () => {
      renderPanel({
        initialLogs: makeLogs([{}, {}, {}]),
        initialHasMore: true,
        onRefresh: vi.fn().mockResolvedValue(undefined),
      });

      expect(getRuleExecutionLogAction).not.toHaveBeenCalled();
      // Refresh drives the host, not the built-in fetch.
      await user.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() => expect(getRuleExecutionLogAction).not.toHaveBeenCalled());
    });
  });

  it("syncs logs and hasMore when initialLogs changes externally", () => {
    const { rerender } = render(
      <ExecutionLogPanel
        workspaceId="ws-1"
        initialLogs={makeLogs([{ ruleName: "First", status: "success" }])}
        initialHasMore={false}
        notify={vi.fn()}
      />,
    );

    expect(screen.getByText("First")).toBeInTheDocument();

    rerender(
      <ExecutionLogPanel
        workspaceId="ws-1"
        initialLogs={makeLogs([{ ruleName: "Second", status: "error" }])}
        initialHasMore={true}
        notify={vi.fn()}
      />,
    );

    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});
