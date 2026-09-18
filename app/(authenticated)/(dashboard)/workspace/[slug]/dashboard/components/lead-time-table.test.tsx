/**
 * RTL — LeadTimeTable pagination (page size 20, Prev/Next + "Page X of N").
 *
 * The engine slice/offset math is proven in lib/analytics/engine.test.ts and
 * the action boundary (auth/isolation/parity) in
 * tests/server-actions/analytics-read.test.ts; this suite proves the client
 * wiring: page 1 is server-rendered at the page size, Previous/Next replace
 * the displayed window at offset (page-1)*pageSize, the "Showing X–Y of Z"
 * + "Page X of N" footer tracks the current page, Previous is disabled on
 * page 1, Next is disabled when hasMore is false, the footer resets to page 1
 * when the filter snapshot changes, and action errors surface inline via
 * role="alert".
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
const PAGE_SIZE = 20;
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
  filterSnapshot = SNAPSHOT,
) {
  return render(
    <LeadTimeTable
      workspaceId={WORKSPACE_ID}
      rows={rows}
      totalCompleted={totalCompleted}
      hasMore={hasMore}
      filterSnapshot={filterSnapshot}
      pageSize={PAGE_SIZE}
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

  it("renders the empty state and no pagination when there are no rows", () => {
    renderTable([]);

    expect(
      screen.getByText("No completed cards match the selected filters."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("shows the page-1 range and total while more rows exist", () => {
    renderTable(
      Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` })),
      228,
      true,
    );

    expect(
      screen.getByText(/Showing 1–20 of 228 completed cards/),
    ).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 12")).toBeInTheDocument();
  });

  it("shows a short final-page range when the last page is partial", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderTable(
      Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` })),
      25,
      true,
    );
    // Page 2 holds rows 21–25 (the remainder of a 25-row set).
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: false,
      totalCompleted: 25,
      rows: Array.from({ length: 5 }, (_, i) =>
        row({ cardId: `c-${i + 21}` }),
      ),
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(
      screen.getByText(/Showing 21–25 of 25 completed cards/),
    ).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    // Last page → Next disabled.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("hides the pagination footer once every completion fits on page 1", () => {
    renderTable([row({ cardId: "c-1" })], 1, false);

    expect(screen.queryByText(/Showing \d+–\d+ of \d+ completed cards/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("LeadTimeTable — pagination", () => {
  beforeEach(() => {
    h.loadMoreLeadTimeRowsAction.mockReset();
  });

  it("disables Previous on page 1 and enables Next while hasMore", () => {
    renderTable(Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` })), 228, true);

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByText("Page 1 of 12")).toBeInTheDocument();
  });

  it("disables Next when hasMore is false (last page)", () => {
    renderTable([row({ cardId: "c-1" })], 21, false);

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("replaces rows when navigating to the next page and updates the footer", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const pageOne = Array.from({ length: 20 }, (_, i) =>
      row({ cardId: `c-${i + 1}` }),
    );
    renderTable(pageOne, 228, true);

    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: true,
      totalCompleted: 228,
      rows: Array.from({ length: 20 }, (_, i) =>
        row({ cardId: `c-${i + 21}`, cardTitle: `Page two card ${i + 1}` }),
      ),
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    // The new window REPLACED the old one (no append: page-1 titles gone).
    expect(screen.getByText("Page two card 1")).toBeInTheDocument();
    expect(screen.queryByText("Card c-1")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 12")).toBeInTheDocument();
    expect(screen.getByText(/Showing 21–40 of 228 completed cards/)).toBeInTheDocument();
    // Previous re-enables once off page 1.
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("fetches the requested page's offset with the page-size limit and the resolved filters", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderTable(Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` })), 228, true);
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: true,
      totalCompleted: 228,
      rows: [],
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    const fd = h.loadMoreLeadTimeRowsAction.mock.calls[0][0] as FormData;
    expect(fd.get("workspaceId")).toBe(WORKSPACE_ID);
    expect(fd.get("from")).toBe(SNAPSHOT.from);
    expect(fd.get("to")).toBe(SNAPSHOT.to);
    // Page 2 starts at offset 20 (1-indexed page → (page-1) * pageSize).
    expect(fd.get("offset")).toBe("20");
    expect(fd.get("limit")).toBe("20");
  });

  it("forwards board/member/archived filters when the dashboard used them", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <LeadTimeTable
        workspaceId={WORKSPACE_ID}
        rows={Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` }))}
        totalCompleted={25}
        hasMore={true}
        pageSize={PAGE_SIZE}
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
      totalCompleted: 25,
      rows: [],
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    const fd = h.loadMoreLeadTimeRowsAction.mock.calls[0][0] as FormData;
    expect(fd.get("boardId")).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(fd.get("memberId")).toBe("user-1");
    expect(fd.get("includeArchivedBoards")).toBe("1");
  });

  it("disables both buttons while a page is loading", async () => {
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
    renderTable(Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` })), 228, true);

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    resolvePage({
      success: true,
      hasMore: true,
      totalCompleted: 228,
      rows: [],
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );
  });

  it("resets to page 1 with the fresh server-rendered rows when the filter snapshot changes", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { rerender } = renderTable(
      Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` })),
      228,
      true,
    );
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: true,
      totalCompleted: 228,
      rows: Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 21}` })),
    });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 12")).toBeInTheDocument();

    // Server re-renders with a new range + its fresh page-1 window.
    const nextSnapshot = {
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-31T00:00:00.000Z",
      boardId: null,
      memberId: null,
      includeArchivedBoards: false,
    } as const;
    rerender(
      <LeadTimeTable
        workspaceId={WORKSPACE_ID}
        rows={Array.from({ length: 20 }, (_, i) => row({ cardId: `m-${i + 1}` }))}
        totalCompleted={25}
        hasMore={false}
        filterSnapshot={nextSnapshot}
        pageSize={PAGE_SIZE}
      />,
    );

    // Back on page 1 of the new set, with the fresh server-rendered rows.
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–20 of 25 completed cards/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    // No stale page-2 data survives the filter change.
    expect(screen.queryByText("Card c-21")).not.toBeInTheDocument();
  });

  it("does not reset the page when re-rendered with the same filter snapshot", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { rerender } = renderTable(
      Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` })),
      228,
      true,
    );
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: true,
      hasMore: true,
      totalCompleted: 228,
      rows: Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 21}` })),
    });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 12")).toBeInTheDocument();

    // Identical filter values in a fresh snapshot object → same filter key.
    rerender(
      <LeadTimeTable
        workspaceId={WORKSPACE_ID}
        rows={Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 21}` }))}
        totalCompleted={228}
        hasMore={true}
        filterSnapshot={{ ...SNAPSHOT }}
        pageSize={PAGE_SIZE}
      />,
    );

    expect(screen.getByText("Page 2 of 12")).toBeInTheDocument();
  });

  it("shows the action error inline via role=alert and keeps the current page", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    h.loadMoreLeadTimeRowsAction.mockResolvedValue({
      success: false,
      error: "Access denied",
    });
    const pageOne = Array.from({ length: 20 }, (_, i) => row({ cardId: `c-${i + 1}` }));
    renderTable(pageOne, 228, true);

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
    // Still on page 1 with the page-1 rows; a retry is possible.
    expect(screen.getByText("Page 1 of 12")).toBeInTheDocument();
    expect(screen.getByText("Card c-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("shows a generic error when the action throws", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    h.loadMoreLeadTimeRowsAction.mockRejectedValue(new Error("network"));
    renderTable([row({ cardId: "c-1" })], 250, true);

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/failed to load rows/i);
  });
});
