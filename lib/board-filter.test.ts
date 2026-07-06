import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  availableLabels,
  availableMembers,
  cardMatchesActivity,
  cardMatchesAllDimensions,
  cardMatchesDue,
  cardMatchesLabels,
  cardMatchesMembers,
  cardMatchesQuery,
  cardMatchesStatus,
  EMPTY_FILTER,
  isFilterActive,
  isSearchActive,
  type CardFilter,
  type FilterableCard,
} from "./board-filter";

// A fixed reference point so the relative due/activity math is deterministic.
const NOW = new Date("2026-07-04T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function makeCard(overrides: Partial<FilterableCard> = {}): FilterableCard {
  return {
    labels: [],
    memberIds: [],
    completedAt: null,
    dueDate: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeFilter(overrides: Partial<CardFilter> = {}): CardFilter {
  return { ...EMPTY_FILTER, ...overrides };
}

describe("isFilterActive / activeFilterCount", () => {
  it("is false / 0 for the empty filter", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
  });

  it("counts every dimension's active constraints", () => {
    const filter = makeFilter({
      labelIds: ["l1", "l2"],
      memberIds: ["m1"],
      noMembers: true,
      assignedToMe: true,
      statuses: ["complete"],
      dueBuckets: ["overdue", "none"],
      activityWindows: ["1w"],
    });
    // 2 labels + 1 member + noMembers + assignedToMe + 1 status + 2 due + 1 activity
    expect(activeFilterCount(filter)).toBe(9);
    expect(isFilterActive(filter)).toBe(true);
  });

  it("is true once any single dimension is constrained", () => {
    expect(isFilterActive(makeFilter({ statuses: ["incomplete"] }))).toBe(true);
    expect(isFilterActive(makeFilter({ noMembers: true }))).toBe(true);
    expect(isFilterActive(makeFilter({ assignedToMe: true }))).toBe(true);
  });
});

describe("isSearchActive", () => {
  it("is false for an empty or whitespace-only query", () => {
    expect(isSearchActive("")).toBe(false);
    expect(isSearchActive("   ")).toBe(false);
  });

  it("is true once the query has non-whitespace content", () => {
    expect(isSearchActive("a")).toBe(true);
    expect(isSearchActive("  bug  ")).toBe(true);
  });
});

describe("cardMatchesQuery", () => {
  it("matches every card for an empty or whitespace-only query", () => {
    expect(cardMatchesQuery({ title: "Anything" }, "")).toBe(true);
    expect(cardMatchesQuery({ title: "Anything" }, "   ")).toBe(true);
  });

  it("matches a case-insensitive substring of the title", () => {
    expect(cardMatchesQuery({ title: "Fix login bug" }, "bug")).toBe(true);
    expect(cardMatchesQuery({ title: "Fix Login Bug" }, "LOGIN")).toBe(true);
    expect(cardMatchesQuery({ title: "Deploy" }, "  ploy ")).toBe(true);
  });

  it("rejects a card whose title does not contain the query", () => {
    expect(cardMatchesQuery({ title: "Fix login bug" }, "logout")).toBe(false);
    expect(cardMatchesQuery({ title: "" }, "x")).toBe(false);
  });
});

describe("cardMatchesLabels", () => {
  const card = (labelIds: string[]) => makeCard({ labels: labelIds.map((id) => ({ id })) });

  it("matches every card when no labels are selected", () => {
    expect(cardMatchesLabels(card([]), [])).toBe(true);
    expect(cardMatchesLabels(card(["l1"]), [])).toBe(true);
  });

  it("matches a card carrying any selected label (OR semantics)", () => {
    expect(cardMatchesLabels(card(["l1"]), ["l1", "l2"])).toBe(true);
    expect(cardMatchesLabels(card(["l2", "l3"]), ["l1", "l2"])).toBe(true);
  });

  it("rejects a card with none of the selected labels", () => {
    expect(cardMatchesLabels(card(["l3"]), ["l1", "l2"])).toBe(false);
    expect(cardMatchesLabels(card([]), ["l1"])).toBe(false);
  });
});

describe("cardMatchesMembers", () => {
  const base = { memberIds: [] as string[], noMembers: false, assignedToMe: false };

  it("matches every card when no member constraint is active", () => {
    expect(cardMatchesMembers(makeCard({ memberIds: ["u1"] }), base, "me")).toBe(true);
    expect(cardMatchesMembers(makeCard({ memberIds: [] }), base, "me")).toBe(true);
  });

  it("matches a card assigned to any selected member (OR)", () => {
    const filter = { ...base, memberIds: ["u1", "u2"] };
    expect(cardMatchesMembers(makeCard({ memberIds: ["u2"] }), filter, "me")).toBe(true);
    expect(cardMatchesMembers(makeCard({ memberIds: ["u3"] }), filter, "me")).toBe(false);
  });

  it("matches only unassigned cards when 'no members' is set", () => {
    const filter = { ...base, noMembers: true };
    expect(cardMatchesMembers(makeCard({ memberIds: [] }), filter, "me")).toBe(true);
    expect(cardMatchesMembers(makeCard({ memberIds: ["u1"] }), filter, "me")).toBe(false);
  });

  it("resolves 'assigned to me' against the current user id", () => {
    const filter = { ...base, assignedToMe: true };
    expect(cardMatchesMembers(makeCard({ memberIds: ["me", "u1"] }), filter, "me")).toBe(true);
    expect(cardMatchesMembers(makeCard({ memberIds: ["u1"] }), filter, "me")).toBe(false);
    // No current user id → "assigned to me" can't resolve, matches nothing on its own.
    expect(cardMatchesMembers(makeCard({ memberIds: ["me"] }), filter, null)).toBe(false);
  });

  it("ORs the specific/none/me options together", () => {
    const filter = { memberIds: ["u1"], noMembers: true, assignedToMe: false };
    expect(cardMatchesMembers(makeCard({ memberIds: ["u1"] }), filter, "me")).toBe(true); // specific
    expect(cardMatchesMembers(makeCard({ memberIds: [] }), filter, "me")).toBe(true); // none
    expect(cardMatchesMembers(makeCard({ memberIds: ["u9"] }), filter, "me")).toBe(false);
  });
});

describe("cardMatchesStatus", () => {
  const complete = makeCard({ completedAt: NOW });
  const incomplete = makeCard({ completedAt: null });

  it("matches all when no status selected", () => {
    expect(cardMatchesStatus(complete, [])).toBe(true);
    expect(cardMatchesStatus(incomplete, [])).toBe(true);
  });

  it("filters by completion", () => {
    expect(cardMatchesStatus(complete, ["complete"])).toBe(true);
    expect(cardMatchesStatus(incomplete, ["complete"])).toBe(false);
    expect(cardMatchesStatus(incomplete, ["incomplete"])).toBe(true);
    expect(cardMatchesStatus(complete, ["incomplete"])).toBe(false);
  });

  it("matches both when both statuses selected", () => {
    expect(cardMatchesStatus(complete, ["complete", "incomplete"])).toBe(true);
    expect(cardMatchesStatus(incomplete, ["complete", "incomplete"])).toBe(true);
  });
});

describe("cardMatchesDue", () => {
  it("matches all when no bucket selected", () => {
    expect(cardMatchesDue(makeCard(), [], NOW)).toBe(true);
  });

  it("overdue = a past calendar day (never today)", () => {
    expect(cardMatchesDue(makeCard({ dueDate: new Date(NOW.getTime() - DAY) }), ["overdue"], NOW)).toBe(true);
    expect(cardMatchesDue(makeCard({ dueDate: new Date(NOW.getTime() + DAY) }), ["overdue"], NOW)).toBe(false);
    expect(cardMatchesDue(makeCard({ dueDate: null }), ["overdue"], NOW)).toBe(false);
  });

  it("a card due today is NOT overdue and falls into the forward windows", () => {
    // Due dates are stored at local midnight (day-granular), so a card due
    // *today* has a timestamp before `now` yet must read as "today" — matching
    // the card-face badge — not "overdue".
    const todayMidnight = new Date(NOW);
    todayMidnight.setHours(0, 0, 0, 0);
    const dueToday = makeCard({ dueDate: todayMidnight });

    expect(cardMatchesDue(dueToday, ["overdue"], NOW)).toBe(false);
    expect(cardMatchesDue(dueToday, ["day"], NOW)).toBe(true);
    expect(cardMatchesDue(dueToday, ["week"], NOW)).toBe(true);
    expect(cardMatchesDue(dueToday, ["month"], NOW)).toBe(true);
  });

  it("day / week / month are nested forward windows (today through N days)", () => {
    const in3d = makeCard({ dueDate: new Date(NOW.getTime() + 3 * DAY) });
    const in20d = makeCard({ dueDate: new Date(NOW.getTime() + 20 * DAY) });
    const in40d = makeCard({ dueDate: new Date(NOW.getTime() + 40 * DAY) });

    expect(cardMatchesDue(in3d, ["day"], NOW)).toBe(false);
    expect(cardMatchesDue(in3d, ["week"], NOW)).toBe(true);
    expect(cardMatchesDue(in20d, ["week"], NOW)).toBe(false);
    expect(cardMatchesDue(in20d, ["month"], NOW)).toBe(true);
    expect(cardMatchesDue(in40d, ["month"], NOW)).toBe(false);
  });

  it("none = no due date", () => {
    expect(cardMatchesDue(makeCard({ dueDate: null }), ["none"], NOW)).toBe(true);
    expect(cardMatchesDue(makeCard({ dueDate: NOW }), ["none"], NOW)).toBe(false);
  });

  it("ORs buckets (overdue OR no-due-date)", () => {
    const buckets = ["overdue", "none"] as const;
    expect(cardMatchesDue(makeCard({ dueDate: new Date(NOW.getTime() - DAY) }), [...buckets], NOW)).toBe(true);
    expect(cardMatchesDue(makeCard({ dueDate: null }), [...buckets], NOW)).toBe(true);
    expect(cardMatchesDue(makeCard({ dueDate: new Date(NOW.getTime() + DAY) }), [...buckets], NOW)).toBe(false);
  });
});

describe("cardMatchesActivity", () => {
  it("matches all when no window selected", () => {
    expect(cardMatchesActivity(makeCard(), [], NOW)).toBe(true);
  });

  it("matches within the selected window boundary", () => {
    const in5d = makeCard({ updatedAt: new Date(NOW.getTime() - 5 * DAY) });
    const in10d = makeCard({ updatedAt: new Date(NOW.getTime() - 10 * DAY) });
    const in20d = makeCard({ updatedAt: new Date(NOW.getTime() - 20 * DAY) });
    const in40d = makeCard({ updatedAt: new Date(NOW.getTime() - 40 * DAY) });

    expect(cardMatchesActivity(in5d, ["1w"], NOW)).toBe(true);
    expect(cardMatchesActivity(in10d, ["1w"], NOW)).toBe(false);
    expect(cardMatchesActivity(in10d, ["2w"], NOW)).toBe(true);
    expect(cardMatchesActivity(in20d, ["2w"], NOW)).toBe(false);
    expect(cardMatchesActivity(in20d, ["4w"], NOW)).toBe(true);
    expect(cardMatchesActivity(in40d, ["4w"], NOW)).toBe(false);
  });

  it("never matches a card with no updatedAt", () => {
    expect(cardMatchesActivity(makeCard({ updatedAt: null }), ["4w"], NOW)).toBe(false);
  });
});

describe("cardMatchesAllDimensions (AND across dimensions)", () => {
  const card = makeCard({
    labels: [{ id: "urgent" }],
    memberIds: ["ana"],
    completedAt: null,
    dueDate: new Date(NOW.getTime() - DAY),
    updatedAt: new Date(NOW.getTime() - 2 * DAY),
  });

  it("passes only when every active dimension matches", () => {
    const filter = makeFilter({
      labelIds: ["urgent"],
      memberIds: ["ana"],
      statuses: ["incomplete"],
      dueBuckets: ["overdue"],
      activityWindows: ["1w"],
    });
    expect(cardMatchesAllDimensions(card, filter, NOW, "me")).toBe(true);
  });

  it("fails when any one dimension excludes the card", () => {
    // label matches, member matches, but require 'complete' status → excluded.
    const filter = makeFilter({ labelIds: ["urgent"], memberIds: ["ana"], statuses: ["complete"] });
    expect(cardMatchesAllDimensions(card, filter, NOW, "me")).toBe(false);
  });

  it("matches everything for the empty filter", () => {
    expect(cardMatchesAllDimensions(card, EMPTY_FILTER, NOW, "me")).toBe(true);
  });
});

describe("availableLabels", () => {
  const label = (id: string, name: string, color = "#000") => ({ id, name, color });

  it("collects distinct labels across all lists and cards, sorted by name", () => {
    const lists = [
      { cards: [{ labels: [label("z", "Zebra")] }, { labels: [label("a", "apple")] }] },
      { cards: [{ labels: [label("a", "apple"), label("m", "Mango")] }] },
    ];
    expect(availableLabels(lists).map((l) => l.name)).toEqual(["apple", "Mango", "Zebra"]);
  });

  it("returns an empty array when no card carries a label", () => {
    expect(availableLabels([{ cards: [{ labels: [] }] }])).toEqual([]);
    expect(availableLabels([])).toEqual([]);
  });

  it("keeps the first-seen snapshot for a repeated label id", () => {
    const lists = [
      { cards: [{ labels: [label("a", "Alpha", "#111")] }] },
      { cards: [{ labels: [label("a", "Alpha-renamed", "#222")] }] },
    ];
    expect(availableLabels(lists)[0].color).toBe("#111");
  });
});

describe("availableMembers", () => {
  const member = (id: string, name: string, image: string | null = null) => ({ id, name, image });

  it("collects distinct assigned members across the board, sorted by name", () => {
    const lists = [
      { cards: [{ members: [member("b", "Bob")] }, { members: [member("a", "Ana")] }] },
      { cards: [{ members: [member("a", "Ana"), member("c", "Cara")] }] },
    ];
    expect(availableMembers(lists).map((m) => m.name)).toEqual(["Ana", "Bob", "Cara"]);
  });

  it("returns an empty array when no card is assigned", () => {
    expect(availableMembers([{ cards: [{ members: [] }] }])).toEqual([]);
    expect(availableMembers([])).toEqual([]);
  });

  it("excludes the given viewer id (the board passes the current user)", () => {
    const lists = [
      { cards: [{ members: [member("me", "Me"), member("a", "Ana")] }] },
      { cards: [{ members: [member("b", "Bob")] }] },
    ];
    // The current viewer is dropped — "Assigned to me" already covers them.
    expect(availableMembers(lists, "me").map((m) => m.id)).toEqual(["a", "b"]);
    // null / omitted excludes no one.
    expect(availableMembers(lists).map((m) => m.id)).toEqual(["a", "b", "me"]);
    expect(availableMembers(lists, null).map((m) => m.id)).toEqual(["a", "b", "me"]);
  });
});
