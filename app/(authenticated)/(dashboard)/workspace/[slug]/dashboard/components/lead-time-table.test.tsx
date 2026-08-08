/**
 * RTL — LeadTimeTable "Load more" pagination (no silent 100-row cap).
 *
 * The engine slice/offset math is proven in lib/analytics/engine.test.ts and
 * the action boundary (auth/isolation/parity) in
 * tests/server-actions/analytics-read.test.ts; this suite proves the client
 * wiring: the button appears only while hasMore, appends the next window
 * behind the displayed rows with a cardId dedupe, echoes the dashboard's
 * resolved filter snapshot + offset, surfaces action errors inline via
 * role="alert", and keeps the original truncation message live.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeadTimeTable } from "./lead-time-table";
import type { LeadTimeRow } from "@/lib/analytics/types";

const h = vi.hoisted(() => ({
  loadMoreLeadTimeRowsAction: vi.fn(),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/actions",
  () => ({
    loadMoreLeadTimeRowsAction: h.loadMoreLeadTimeRowsAction,
  }),
);

const WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SNAPSHOT = {
  from: "2026-02-01T00:00:00.000Z",
  to: "2026-02-28T00:00:00.000Z",
  boardId: null,
  memberId: null,
  includeArchivedBoards: false,
} as const;

function row(overrides: Partial<LeadTimeRow> & { cardId: string }): LeadTimeRow {
  return {
    cardTitle: `Card ${overrides.cardId}`,
    createdAt: new Date("2026-01-10T00:00:00.000Z"),
    completedAt: new Date("2026-02-05T00:00:00.000Z"),
    leadTimeHours: 26 * 24,
    dueDate: null,
    wasLate: false,
    ...overrides,
  };
}

function renderTable(
  rows: LeadTimeRow[],
  totalCompleted = rows.length,
  hasMore = false,
) {
  return render(
    <LeadTimeTable
      workspaceId={WORKSPACE_ID}
      rows={rows}
      totalCompleted={totalCompleted}
      hasMore={hasMore}
      filterSnapshot={SNAPSHOT}
    />,
  );
}

describe("LeadTimeTable — rendering", () => {
  it("renders the table header and every row", () => {
    renderTable([
      row({ cardId: "c-1", cardTitle: "First card" }),
      row({ cardId: "c-2", cardTitle: "Second card" }),
    ]);

    expect(
      screen.getByRole("heading", { name: "Lead-time detail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("First card")).toBeInTheDocument();
    expect(screen.getByText("Second card")).toBeInTheDocument();
  });

  it("renders the empty state when there are no rows", () => {
    renderTable([]);

    expect(
      screen.getByText("No completed cards match the selected filters."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows the truncation message while totalCompleted exceeds displayed rows", () => {
    renderTable([row({ cardId: "c-1" })], 150, true);

    expect(screen.getByText(/Showing 1 of 150 completed cards/)).toBeInTheDocument();
  });

  it("hides the truncation message once every completion is displayed", () => {
    renderTable([row({ cardId: "c-1" })], 1, false);

    expect(screen.queryByText(/Showed?ing \d+ of \d+ completed cards/)).not.toBeInTheDocument();
  });
});

describe("LeadTimeTable — Load more pagination", () => {
  beforeEach(() => {
    h.loadMoreLeadTimeRowsAction.mockReset();
  });

  it("shows the Load more button when hasMore is true", () => {
    renderTable([row({ cardId: "c-1" })], 250, true);
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("hides the Load more button when hasMore is false", () => {
    renderTable([row({ cardId: "c-1" })], 250, false);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("appends the next window, dedupes by cardId, and updates the message", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderTable([row({ cardId: "c-1" })], 3, true);

    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: false,
      totalCompleted: 3,
      rows: [
        row({ cardId: "c-2" }),
        // A duplicate of an already-displayed card (set shifted between
        // renders) — must not render twice.
        row({ cardId: "c-1" }),
        row({ cardId: "c-3" }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    // Once every completion is loaded the truncation message disappears.
    expect(
      screen.queryByText(/Showing \d+ of \d+ completed cards/),
    ).not.toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    // header + 3 unique data rows
    expect(rows).toHaveLength(4);
    // hasMore false → the affordance disappears (nothing hidden silently).
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("echoes the resolved filter snapshot and the next offset to the action", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderTable([row({ cardId: "c-1" }), row({ cardId: "c-2" })], 5, true);
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: true,
      totalCompleted: 5,
      rows: [],
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    const fd = h.loadMoreLeadTimeRowsAction.mock.calls[0][0] as FormData;
    expect(fd.get("workspaceId")).toBe(WORKSPACE_ID);
    expect(fd.get("from")).toBe(SNAPSHOT.from);
    expect(fd.get("to")).toBe(SNAPSHOT.to);
    // The next window starts after every row already displayed.
    expect(fd.get("offset")).toBe("2");
    expect(fd.get("limit")).toBe("100");
  });

  it("forwards board/member/archived filters when the dashboard used them", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <LeadTimeTable
        workspaceId={WORKSPACE_ID}
        rows={[row({ cardId: "c-1" })]}
        totalCompleted={2}
        hasMore={true}
        filterSnapshot={{
          from: SNAPSHOT.from,
          to: SNAPSHOT.to,
          boardId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          memberId: "user-1",
          includeArchivedBoards: true,
        }}
      />,
    );
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: false,
      totalCompleted: 2,
      rows: [],
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    const fd = h.loadMoreLeadTimeRowsAction.mock.calls[0][0] as FormData;
    expect(fd.get("boardId")).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(fd.get("memberId")).toBe("user-1");
    expect(fd.get("includeArchivedBoards")).toBe("1");
  });

  it("disables the button while a page is loading", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    let resolvePage!: (value: {
      success: true;
      rows: LeadTimeRow[];
      hasMore: boolean;
      totalCompleted: number;
    }) => void;
    h.loadMoreLeadTimeRowsAction.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    renderTable([row({ cardId: "c-1" })], 250, true);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    const loading = screen.getByRole("button", { name: "Loading..." });
    expect(loading).toBeDisabled();

    resolvePage({ success: true, hasMore: false, totalCompleted: 250, rows: [] });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Loading..." })).not.toBeInTheDocument(),
    );
  });

  it("shows the action error inline via role=alert and keeps the button for a retry", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: false,
      error: "Access denied",
    });
    renderTable([row({ cardId: "c-1" })], 250, true);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("shows a generic error when the action throws", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    h.loadMoreLeadTimeRowsAction.mockRejectedValue(new Error("network"));
    renderTable([row({ cardId: "c-1" })], 250, true);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/failed to load more rows/i);
  });
});
