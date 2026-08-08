/**
 * US-083 W6 — pure `/today` grouping helpers (lib/today.ts).
 *
 * The four buckets are disjoint in the VIEWER'S LOCAL calendar time, so every
 * test constructs dates with the local-time constructor (`new Date(y, m, d, …)`)
 * — deterministic in any runner timezone. `now` is injected everywhere; the
 * helpers never read the clock.
 *
 * Bucket contract (locked): Overdue diff<0; Due Today diff=0; Due This Week
 * diff 1..7 inclusive; Later diff>=8 or no due date. diff = whole calendar
 * days from now to dueDate in the local calendar (DST-proof day-number
 * arithmetic, never 24h rollover).
 */
import { describe, expect, it } from "vitest";

import {
  calendarDayDiff,
  describeTodayDue,
  getTodayLoadMoreCursor,
  getTodaySectionKey,
  groupTodayCards,
  type TodayCard,
} from "./today";

// Fixed "now": Aug 3, 2026, 14:30 local — mid-afternoon so boundary cases
// exercise calendar-day semantics rather than 24h windows.
const NOW = new Date(2026, 7, 3, 14, 30, 0, 0);

function due(y: number, m: number, d: number, h = 12, min = 0, s = 0): string {
  return new Date(y, m, d, h, min, s).toISOString();
}

describe("calendarDayDiff", () => {
  it("is 0 for any time on the same local calendar day", () => {
    expect(calendarDayDiff(new Date(2026, 7, 3, 0, 0, 0, 1), NOW)).toBe(0);
    expect(calendarDayDiff(new Date(2026, 7, 3, 23, 59, 59, 999), NOW)).toBe(0);
  });

  it("counts whole calendar days, not 24h windows", () => {
    // One minute before `now` but on the previous calendar day → -1, not 0.
    expect(calendarDayDiff(new Date(2026, 7, 2, 14, 29), NOW)).toBe(-1);
    // 23h before `now` but still the same calendar day → 0.
    expect(calendarDayDiff(new Date(2026, 7, 3, 14, 29), NOW)).toBe(0);
    // 22h after `now` but on the NEXT calendar day → 1.
    expect(calendarDayDiff(new Date(2026, 7, 4, 12, 0), NOW)).toBe(1);
  });

  it("is exact across a DST transition (no 23/25h-day drift)", () => {
    // Mar 8 2026 is the US spring-forward date; in any runner TZ these are
    // still adjacent/exact local calendar days.
    const dstNow = new Date(2026, 2, 8, 12, 0);
    expect(calendarDayDiff(new Date(2026, 2, 9, 0, 0), dstNow)).toBe(1);
    expect(calendarDayDiff(new Date(2026, 2, 15, 12, 0), dstNow)).toBe(7);
    expect(calendarDayDiff(new Date(2026, 2, 7, 12, 0), dstNow)).toBe(-1);
    expect(calendarDayDiff(new Date(2026, 2, 16, 0, 0), dstNow)).toBe(8);
  });

  it("handles year boundaries", () => {
    const yearEnd = new Date(2026, 11, 30, 9, 0);
    expect(calendarDayDiff(new Date(2027, 0, 2, 9, 0), yearEnd)).toBe(3);
  });
});

describe("getTodaySectionKey", () => {
  it("maps each bucket boundary exactly (diff <0 / 0 / 1..7 / >=8)", () => {
    // Overdue: diff < 0
    expect(getTodaySectionKey(due(2026, 7, 2, 23, 59), NOW)).toBe("overdue");
    expect(getTodaySectionKey(due(2026, 6, 31, 0, 0), NOW)).toBe("overdue");
    // Due Today: diff === 0 — both local-midnight edges.
    expect(getTodaySectionKey(due(2026, 7, 3, 0, 0), NOW)).toBe("today");
    expect(getTodaySectionKey(due(2026, 7, 3, 23, 59, 59), NOW)).toBe("today");
    // Due This Week: diff 1..7 inclusive.
    expect(getTodaySectionKey(due(2026, 7, 4, 0, 0), NOW)).toBe("week");
    expect(getTodaySectionKey(due(2026, 7, 10, 23, 59), NOW)).toBe("week");
    // Later: diff >= 8 or no due date.
    expect(getTodaySectionKey(due(2026, 7, 11, 0, 0), NOW)).toBe("later");
    expect(getTodaySectionKey(due(2026, 11, 25, 0, 0), NOW)).toBe("later");
    expect(getTodaySectionKey(null, NOW)).toBe("later");
  });

  it("treats an unparseable due date as Later (defensive)", () => {
    expect(getTodaySectionKey("not-a-date", NOW)).toBe("later");
  });
});

describe("describeTodayDue", () => {
  it("returns null when there is no due date", () => {
    expect(describeTodayDue(null, NOW)).toBeNull();
  });

  it("labels overdue by date with an explicit 'Overdue' a11y string", () => {
    expect(describeTodayDue(due(2026, 7, 1, 12, 0), NOW)).toEqual({
      label: "Aug 1",
      a11yLabel: "Overdue, due Aug 1",
    });
  });

  it("labels today / tomorrow with words", () => {
    expect(describeTodayDue(due(2026, 7, 3, 8, 0), NOW)).toEqual({
      label: "Today",
      a11yLabel: "Due today",
    });
    expect(describeTodayDue(due(2026, 7, 4, 8, 0), NOW)).toEqual({
      label: "Tomorrow",
      a11yLabel: "Due tomorrow",
    });
  });

  it("pins date labels to the English (en-US) UI locale", () => {
    // The English Planora UI formats date labels with an explicit locale, so
    // a non-en-US runner/browser can never produce different text (or
    // server/client-divergent labels). Exact English output is the contract.
    expect(describeTodayDue(due(2026, 7, 8, 8, 0), NOW)).toEqual({
      label: "Aug 8",
      a11yLabel: "Due Aug 8",
    });
    expect(describeTodayDue(due(2026, 6, 20, 8, 0), NOW)).toEqual({
      label: "Jul 20",
      a11yLabel: "Overdue, due Jul 20",
    });
  });

  it("labels later dates by calendar date, with the year when it differs", () => {
    expect(describeTodayDue(due(2026, 7, 8, 8, 0), NOW)).toEqual({
      label: "Aug 8",
      a11yLabel: "Due Aug 8",
    });
    // Year-crossing: label carries the year (dayLabel adds it when needed).
    const yearEnd = new Date(2026, 11, 30, 9, 0);
    const janLabel = describeTodayDue(
      new Date(2027, 0, 2, 9, 0).toISOString(),
      yearEnd,
    );
    expect(janLabel).not.toBeNull();
    expect(janLabel!.a11yLabel).toMatch(/^Due .*2027$/);
  });
});

describe("getTodayLoadMoreCursor", () => {
  it("returns null for an empty list (nothing loaded yet)", () => {
    expect(getTodayLoadMoreCursor([])).toBeNull();
  });

  it("returns the card that sorts last in the server (dueDate asc nulls last, id asc) order", () => {
    const cursor = getTodayLoadMoreCursor([
      card({ id: "c-earlier", title: "Earliest", dueDate: due(2026, 7, 3) }),
      card({ id: "c-nodue", title: "No due" }),
      card({ id: "c-2", title: "Beta", dueDate: due(2026, 7, 5) }),
    ]);
    // The no-due card sorts after every dated card (nulls last).
    expect(cursor).toEqual({ dueDate: null, id: "c-nodue" });
  });

  it("breaks equal due dates by id ascending — the max is the last loaded row", () => {
    const sameDue = due(2026, 7, 5);
    const cursor = getTodayLoadMoreCursor([
      card({ id: "b", title: "Beta", dueDate: sameDue }),
      card({ id: "z", title: "Zulu", dueDate: sameDue }),
      card({ id: "a", title: "Alpha", dueDate: sameDue }),
    ]);
    expect(cursor).toEqual({ dueDate: sameDue, id: "z" });
  });

  it("a dated card is never after a no-due cursor position", () => {
    const cursor = getTodayLoadMoreCursor([
      card({ id: "c-nodue", title: "No due" }),
      card({ id: "c-dated", title: "Dated far away", dueDate: due(2026, 12, 31) }),
    ]);
    expect(cursor).toEqual({ dueDate: null, id: "c-nodue" });
  });

  it("skips completed cards (the read model never returns them)", () => {
    const cursor = getTodayLoadMoreCursor([
      card({
        id: "c-done",
        title: "Done",
        dueDate: due(2026, 7, 5),
        completedAt: due(2026, 7, 2),
      }),
      card({ id: "c-live", title: "Live", dueDate: due(2026, 7, 6) }),
    ]);
    expect(cursor).toEqual({ dueDate: due(2026, 7, 6), id: "c-live" });
  });

  it("is order-independent: over any deduped prefix it returns the prefix's last server-order row", () => {
    const serverOrder = [
      card({ id: "a", title: "A", dueDate: due(2026, 7, 3) }),
      card({ id: "b", title: "B", dueDate: due(2026, 7, 3) }),
      card({ id: "c", title: "C", dueDate: due(2026, 7, 10) }),
      card({ id: "d", title: "D", dueDate: null }),
      card({ id: "e", title: "E", dueDate: null }),
    ];
    // Shuffled first three (the first page, re-sorted for display): the cursor
    // must still be the last row of that prefix in SERVER order (c).
    expect(
      getTodayLoadMoreCursor([serverOrder[2], serverOrder[0], serverOrder[1]]),
    ).toEqual({ dueDate: due(2026, 7, 10), id: "c" });
    // The whole set, reversed: the very last server row (no-due, highest id).
    expect(getTodayLoadMoreCursor([...serverOrder].reverse())).toEqual({
      dueDate: null,
      id: "e",
    });
  });
});


const BOARD_A = {
  id: "board-1",
  title: "Product Roadmap",
  workspaceId: "ws-1",
  workspace: { name: "Acme" },
};

function card(overrides: Partial<TodayCard> & { id: string; title: string }): TodayCard {
  return {
    dueDate: null,
    completedAt: null,
    priority: null,
    board: BOARD_A,
    list: { id: "list-1", title: "To Do" },
    ...overrides,
  };
}

// ── groupTodayCards ─────────────────────────────────────────────────────────

describe("groupTodayCards", () => {
  it("returns the four sections in fixed order with correct counts", () => {
    const groups = groupTodayCards(
      [
        card({ id: "c-later-far", title: "Far future", dueDate: due(2026, 8, 10) }),
        card({ id: "c-week", title: "Next week", dueDate: due(2026, 7, 6) }),
        card({ id: "c-overdue", title: "Late", dueDate: due(2026, 6, 20) }), // Jul 20 → diff -14
        card({ id: "c-today", title: "Today card", dueDate: due(2026, 7, 3) }),
      ],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "week", "later"]);
    expect(groups.map((g) => g.title)).toEqual([
      "Overdue",
      "Due Today",
      "Due This Week",
      "Later",
    ]);
    expect(groups.map((g) => g.count)).toEqual([1, 1, 1, 1]);
    expect(groups.map((g) => g.cards[0].id)).toEqual([
      "c-overdue",
      "c-today",
      "c-week",
      "c-later-far",
    ]);
  });

  it("sorts within a section by due date ascending, then title", () => {
    const groups = groupTodayCards(
      [
        card({ id: "c-1", title: "Beta", dueDate: due(2026, 7, 5) }),
        card({ id: "c-2", title: "Alpha", dueDate: due(2026, 7, 5) }),
        card({ id: "c-3", title: "Earliest", dueDate: due(2026, 7, 4) }),
      ],
      NOW,
    );

    const week = groups.find((g) => g.key === "week")!;
    // Earliest first; the same-due pair (c-1 "Beta" / c-2 "Alpha") breaks by title.
    expect(week.cards.map((c) => c.id)).toEqual(["c-3", "c-2", "c-1"]);
  });

  it("places no-due-date cards in Later, sorted after dated cards by title", () => {
    const groups = groupTodayCards(
      [
        card({ id: "c-nodue-b", title: "Zebra", dueDate: null }),
        card({ id: "c-far", title: "AAA far", dueDate: due(2026, 9, 1) }),
        card({ id: "c-nodue-a", title: "Alpha", dueDate: null }),
      ],
      NOW,
    );

    const later = groups.find((g) => g.key === "later")!;
    expect(later.cards.map((c) => c.id)).toEqual(["c-far", "c-nodue-a", "c-nodue-b"]);
  });

  it("never surfaces a completed card in any section (AC2 predicate)", () => {
    const groups = groupTodayCards(
      [
        card({
          id: "c-done",
          title: "Done card",
          dueDate: due(2026, 7, 2), // would be Overdue if live
          completedAt: new Date(2026, 7, 2, 9, 0).toISOString(),
        }),
        card({ id: "c-live", title: "Live card", dueDate: due(2026, 7, 3) }),
      ],
      NOW,
    );

    expect(groups.map((g) => g.count)).toEqual([0, 1, 0, 0]);
    expect(groups.flatMap((g) => g.cards).map((c) => c.id)).toEqual(["c-live"]);
  });

  it("returns four empty sections for an empty input", () => {
    const groups = groupTodayCards([], NOW);
    expect(groups.map((g) => [g.key, g.count])).toEqual([
      ["overdue", 0],
      ["today", 0],
      ["week", 0],
      ["later", 0],
    ]);
  });
});
