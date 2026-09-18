/**
 * US-083 W6 — `/today` client boundary (TodayView) renders the four
 * viewer-local sections with real deep links to the board/card context.
 *
 * `now` is injected through the prop so bucket placement is deterministic in
 * any runner timezone; the grouping itself is unit-proven in lib/today.test.ts
 * — this suite proves the component wires it: section headings + counts, tile
 * links (real `/boards/{boardId}?cardId={cardId}` anchors, no in-place sheet),
 * board/list/workspace context, due + priority meta chips (non-color-only
 * labels), and the two accessible empty states.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { TodayView } from "./today-view";
import type { TodayCard } from "@/lib/today";

const h = vi.hoisted(() => ({
  loadMoreTodayCardsAction: vi.fn(),
}));

vi.mock("@/app/(authenticated)/(dashboard)/today/actions", () => ({
  loadMoreTodayCardsAction: h.loadMoreTodayCardsAction,
}));

// Next's own <Link> mounts an internal IntersectionObserver (use-intersection)
// that would pollute the fake-IO instances below and crash when the global is
// stubbed to undefined. Render plain anchors instead: the suite asserts the
// href/aria-label/className contract, not Link's internals (real navigation
// is covered by e2e/today.spec.ts).
vi.mock("next/link", () => {
  type MockLinkProps = {
    href: string;
    children?: ReactNode;
    "aria-label"?: string;
    className?: string;
  };
  const MockLink = ({ href, children, ...rest }: MockLinkProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { default: MockLink };
});

/**
 * Test double for IntersectionObserver: installed via vi.stubGlobal inside
 * the infinite-scroll suite. Every observer created by the component is
 * recorded (instances) and each test drives intersections manually — proving
 * the sentinel trigger without a layout engine. `disconnected` mirrors the
 * component's cleanup contract: an in-flight load, an error, or the end of
 * data must tear the observer down so auto-load can never double-fire.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly callback: IntersectionObserverCallback;
  readonly elements = new Set<Element>();
  disconnected = false;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
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

// Aug 3, 2026 14:30 local — matches the lib/today.test.ts fixture clock.
const NOW = new Date(2026, 7, 3, 14, 30, 0, 0);

function due(y: number, m: number, d: number): string {
  return new Date(y, m, d, 9, 0).toISOString();
}

function card(overrides: Partial<TodayCard> & { id: string; title: string }): TodayCard {
  return {
    dueDate: null,
    completedAt: null,
    priority: null,
    board: {
      id: "board-1",
      title: "Product Roadmap",
      workspaceId: "ws-1",
      workspace: { name: "Acme" },
    },
    list: { id: "list-1", title: "To Do" },
    ...overrides,
  };
}

function renderToday(cards: TodayCard[], workspaceCount = 1, hasMore = false) {
  return render(
    <TodayView workspaceCount={workspaceCount} cards={cards} hasMore={hasMore} now={NOW} />,
  );
}

/** The component's most recently created observer (the active one). */
function currentObserver() {
  const observer = FakeIntersectionObserver.instances.at(-1);
  expect(observer).toBeDefined();
  return observer!;
}

describe("TodayView — sections and tiles", () => {
  it("renders the four sections in order with heading + count badges", () => {
    renderToday([
      card({ id: "c-overdue", title: "Late", dueDate: due(2026, 6, 20) }),
      card({ id: "c-today", title: "Today card", dueDate: due(2026, 7, 3) }),
      card({ id: "c-week", title: "Week card", dueDate: due(2026, 7, 5) }),
      card({ id: "c-far", title: "Far", dueDate: due(2026, 9, 1) }),
      card({ id: "c-nodue", title: "No due", dueDate: null }),
    ]);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Overdue",
      "Due Today",
      "Due This Week",
      "Later",
    ]);

    const overdueSection = screen.getByRole("heading", { name: "Overdue" }).closest("section")!;
    expect(within(overdueSection).getByText("1")).toBeInTheDocument();
    expect(within(overdueSection).getByRole("link", { name: "Open card Late" })).toBeInTheDocument();
    const laterSection = screen.getByRole("heading", { name: "Later" }).closest("section")!;
    expect(within(laterSection).getByText("2")).toBeInTheDocument();
    expect(within(laterSection).getAllByRole("link")).toHaveLength(2);
  });

  it("renders each tile as a real deep link to the board/card context", () => {
    renderToday([card({ id: "card-1", title: "Ship it", dueDate: due(2026, 7, 3) })]);

    const link = screen.getByRole("link", { name: "Open card Ship it" });
    expect(link).toHaveAttribute("href", "/boards/board-1?cardId=card-1");
  });

  it("shows workspace · board · list context on every tile", () => {
    renderToday([
      card({
        id: "card-2",
        title: "Context",
        dueDate: due(2026, 7, 3),
        board: {
          id: "board-2",
          title: "Sprint",
          workspaceId: "ws-2",
          workspace: { name: "Globex" },
        },
        list: { id: "list-2", title: "In Progress" },
      }),
    ]);

    expect(screen.getByText("Globex · Sprint · In Progress")).toBeInTheDocument();
  });

  it("renders due-date meta with non-color-only labels (word + a11y string)", () => {
    renderToday([
      card({ id: "c-overdue", title: "Late", dueDate: due(2026, 6, 20) }),
      card({ id: "c-today", title: "Today card", dueDate: due(2026, 7, 3) }),
    ]);

    const late = screen.getByRole("link", { name: "Open card Late" });
    expect(within(late).getByText("Jul 20")).toBeInTheDocument();
    expect(within(late).getByLabelText("Overdue, due Jul 20")).toBeInTheDocument();

    const today = screen.getByRole("link", { name: "Open card Today card" });
    expect(within(today).getByText("Today")).toBeInTheDocument();
    expect(within(today).getByLabelText("Due today")).toBeInTheDocument();
  });

  it("renders the priority chip with its word label (never color-only)", () => {
    renderToday([
      card({
        id: "c-prio",
        title: "Urgent one",
        dueDate: due(2026, 7, 3),
        priority: "URGENT",
      }),
    ]);

    const tile = screen.getByRole("link", { name: "Open card Urgent one" });
    expect(within(tile).getByText("Urgent")).toBeInTheDocument();
  });

  it("omits the due chip for cards without a due date", () => {
    renderToday([card({ id: "c-nodue", title: "No due" })]);

    const tile = screen.getByRole("link", { name: "Open card No due" });
    expect(within(tile).queryByLabelText(/due/i)).not.toBeInTheDocument();
  });

  it("never renders a completed card (query + grouping both exclude it)", () => {
    renderToday([
      card({
        id: "c-done",
        title: "Done",
        dueDate: due(2026, 7, 2),
        completedAt: due(2026, 7, 2),
      }),
    ]);

    expect(screen.queryByRole("link", { name: "Open card Done" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overdue" })).toBeInTheDocument();
  });
});

describe("TodayView — hydration safety (US-083 W6 corrections)", () => {
  const groupedCards = [
    card({ id: "c-overdue", title: "Late", dueDate: due(2026, 6, 20) }),
    card({ id: "c-today", title: "Today card", dueDate: due(2026, 7, 3) }),
  ];

  it("server-renders a deterministic loading placeholder, never time-grouped sections", () => {
    // The page SSRs with the SERVER clock/zone/locale and hydrates with the
    // BROWSER clock — a remote viewer's midnight can differ from the server's.
    // Server markup must therefore be identical for any clock: a bucket
    // structure computed on the server (e.g. "Overdue" vs "Due Today") would
    // rebucket on hydration and mismatch. Two wildly different clocks prove
    // the server output carries no time-dependent grouping at all.
    const htmlWinter = renderToStaticMarkup(
      <TodayView
        workspaceCount={1}
        cards={groupedCards}
        hasMore={false}
        now={new Date(2026, 0, 15, 9, 0)}
      />,
    );
    const htmlSummer = renderToStaticMarkup(
      <TodayView
        workspaceCount={1}
        cards={groupedCards}
        hasMore={false}
        now={new Date(2026, 7, 3, 9, 0)}
      />,
    );

    expect(htmlWinter).toBe(htmlSummer);
    expect(htmlWinter).toContain("Loading your day");
    expect(htmlWinter).not.toContain("Overdue");
    expect(htmlWinter).not.toContain("Due Today");
    expect(htmlWinter).not.toContain("Open card ");
    // The infinite-scroll status area is client-only too — the server never
    // emits the end-of-list completion line.
    expect(htmlWinter).not.toContain("All assigned cards are shown");
  });

  it("still server-renders the accessible empty states (props-only, deterministic)", () => {
    const noWorkspaces = renderToStaticMarkup(
      <TodayView workspaceCount={0} cards={[]} hasMore={false} now={new Date(2026, 0, 15)} />,
    );
    expect(noWorkspaces).toContain("No workspaces yet");

    const nothingAssigned = renderToStaticMarkup(
      <TodayView workspaceCount={1} cards={[]} hasMore={false} now={new Date(2026, 7, 3)} />,
    );
    expect(nothingAssigned).toContain("Nothing assigned");
  });
});

describe("TodayView — empty states", () => {
  it("shows the join-a-workspace empty state for zero memberships", () => {
    renderToday([], 0);

    expect(screen.getByRole("heading", { name: "No workspaces yet" })).toBeInTheDocument();
    expect(screen.getByText(/join or create a workspace/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to boards/i })).toHaveAttribute("href", "/boards");
  });

  it("shows the nothing-assigned empty state for memberships with no cards", () => {
    renderToday([], 1);

    expect(screen.getByRole("heading", { name: "Nothing assigned" })).toBeInTheDocument();
    expect(screen.getByText(/later/i)).toBeInTheDocument();
  });
});

describe("TodayView — infinite scroll (no silent cap)", () => {
  beforeEach(() => {
    h.loadMoreTodayCardsAction.mockReset();
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the completion status (no CTA) when nothing is left", () => {
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      false,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "All assigned cards are shown",
    );
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("hides the prominent Load more CTA while the observer is active", () => {
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      true,
    );

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(0);
  });

  it("auto-loads the next keyset page on sentinel intersection; dedupes and re-groups", async () => {
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      true,
    );
    h.loadMoreTodayCardsAction.mockResolvedValue({
      success: true,
      hasMore: false,
      items: [
        card({ id: "c-2", title: "Appended today", dueDate: due(2026, 7, 3) }),
        // A duplicate of an already-displayed card — must not render twice.
        card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) }),
      ],
    });

    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(1));
    act(() => currentObserver().fire(true));

    await waitFor(() =>
      expect(h.loadMoreTodayCardsAction).toHaveBeenCalledTimes(1),
    );

    // The cursor is the last loaded card in server (dueDate, id) order and
    // the batch size is TODAY_PAGE_SIZE = 30.
    const fd = h.loadMoreTodayCardsAction.mock.calls[0][0] as FormData;
    expect(fd.get("limit")).toBe("30");
    expect(fd.get("cursorId")).toBe("c-1");
    expect(fd.get("cursorDueDate")).toBe(due(2026, 7, 3));

    // The appended card re-groups into the right section; the duplicate id
    // renders exactly once.
    expect(
      screen.getByRole("link", { name: "Open card Appended today" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open card First" }),
    ).toBeInTheDocument();
    const todaySection = screen.getByRole("heading", { name: "Due Today" }).closest("section")!;
    expect(within(todaySection).getAllByRole("link")).toHaveLength(2);

    // hasMore false → completion status replaces the loop (nothing hidden
    // silently) and the observer is torn down.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "All assigned cards are shown",
      ),
    );
    expect(currentObserver().disconnected).toBe(true);
  });

  it("keeps already-displayed sections intact while appending (load lands in a new section)", async () => {
    renderToday(
      [card({ id: "c-overdue", title: "Late", dueDate: due(2026, 6, 20) })],
      1,
      true,
    );
    h.loadMoreTodayCardsAction.mockResolvedValue({
      success: true,
      hasMore: false,
      items: [card({ id: "c-week", title: "Next week", dueDate: due(2026, 7, 6) })],
    });

    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(1));
    act(() => currentObserver().fire(true));
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Open card Next week" }),
      ).toBeInTheDocument(),
    );

    const overdue = screen.getByRole("heading", { name: "Overdue" }).closest("section")!;
    expect(within(overdue).getByRole("link", { name: "Open card Late" })).toBeInTheDocument();
    const week = screen.getByRole("heading", { name: "Due This Week" }).closest("section")!;
    expect(within(week).getByRole("link", { name: "Open card Next week" })).toBeInTheDocument();
  });

  it("sends an empty cursorDueDate for a no-due last card (null-dueDate cursor position)", async () => {
    renderToday([card({ id: "c-nodue", title: "No due" })], 1, true);
    h.loadMoreTodayCardsAction.mockResolvedValue({
      success: true,
      hasMore: false,
      items: [],
    });

    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(1));
    act(() => currentObserver().fire(true));
    await waitFor(() =>
      expect(h.loadMoreTodayCardsAction).toHaveBeenCalledTimes(1),
    );

    const fd = h.loadMoreTodayCardsAction.mock.calls[0][0] as FormData;
    expect(fd.get("cursorId")).toBe("c-nodue");
    expect(fd.get("cursorDueDate")).toBe("");
  });

  it("shows a muted loading status while a batch is in flight", async () => {
    let resolvePage!: (value: {
      success: true;
      items: TodayCard[];
      hasMore: boolean;
    }) => void;
    h.loadMoreTodayCardsAction.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      true,
    );

    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(1));
    act(() => currentObserver().fire(true));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Loading more cards…"),
    );

    resolvePage({ success: true, hasMore: false, items: [] });
    await waitFor(() =>
      expect(screen.queryByText("Loading more cards…")).not.toBeInTheDocument(),
    );
  });

  it("never fires a second request while a batch is loading (single flight)", async () => {
    let resolvePage!: (value: {
      success: true;
      items: TodayCard[];
      hasMore: boolean;
    }) => void;
    h.loadMoreTodayCardsAction.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      true,
    );

    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(1));
    const observer = currentObserver();

    // Two intersections in the same tick: the in-flight guard must collapse
    // them into exactly one request.
    act(() => {
      observer.fire(true);
      observer.fire(true);
    });
    await waitFor(() =>
      expect(h.loadMoreTodayCardsAction).toHaveBeenCalledTimes(1),
    );

    resolvePage({ success: true, hasMore: false, items: [] });
    await waitFor(() =>
      expect(screen.queryByText("Loading more cards…")).not.toBeInTheDocument(),
    );
  });

  it("tears the observer down on error and offers a subtle retry fallback that re-arms", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    h.loadMoreTodayCardsAction.mockResolvedValue({
      success: false,
      error: "Failed to load cards",
    });
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      true,
    );

    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(1));
    const observer = currentObserver();
    act(() => observer.fire(true));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to load cards"),
    );
    // The observer is gone: an auto-retry loop can never hammer the action.
    expect(observer.disconnected).toBe(true);
    const retry = screen.getByRole("button", { name: "Load more" });
    expect(retry).toBeInTheDocument();

    // A successful retry appends, clears the error, and re-arms auto-load.
    h.loadMoreTodayCardsAction.mockResolvedValue({
      success: true,
      hasMore: true,
      items: [card({ id: "c-2", title: "Appended", dueDate: due(2026, 7, 3) })],
    });
    await user.click(retry);

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Open card Appended" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(2));
    expect(FakeIntersectionObserver.instances[1].disconnected).toBe(false);
  });

  it("shows the action's generic error and keeps the retry affordance when the action throws", async () => {
    h.loadMoreTodayCardsAction.mockRejectedValue(new Error("network"));
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      true,
    );

    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBe(1));
    act(() => currentObserver().fire(true));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /failed to load more cards/i,
    );
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("falls back to a standing manual affordance when IntersectionObserver is unavailable", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    vi.stubGlobal("IntersectionObserver", undefined);
    renderToday(
      [card({ id: "c-1", title: "First", dueDate: due(2026, 7, 3) })],
      1,
      true,
    );

    // No observer was created; the subtle ghost button is the only path to
    // more cards.
    expect(FakeIntersectionObserver.instances.length).toBe(0);
    const loadMore = screen.getByRole("button", { name: "Load more" });

    h.loadMoreTodayCardsAction.mockResolvedValue({
      success: true,
      hasMore: false,
      items: [card({ id: "c-2", title: "Appended", dueDate: due(2026, 7, 3) })],
    });
    await user.click(loadMore);

    const fd = h.loadMoreTodayCardsAction.mock.calls[0][0] as FormData;
    expect(fd.get("limit")).toBe("30");
    expect(fd.get("cursorId")).toBe("c-1");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "All assigned cards are shown",
      ),
    );
  });
});
