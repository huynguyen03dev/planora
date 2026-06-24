import { describe, expect, it } from "vitest";

import {
  availableLabels,
  cardMatchesFilter,
  EMPTY_FILTER,
  isFilterActive,
} from "./board-filter";

const card = (labelIds: string[]) => ({
  labels: labelIds.map((id) => ({ id })),
});

describe("isFilterActive", () => {
  it("is false for the empty filter", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ labelIds: [] })).toBe(false);
  });

  it("is true once a label is selected", () => {
    expect(isFilterActive({ labelIds: ["l1"] })).toBe(true);
  });
});

describe("cardMatchesFilter", () => {
  it("matches every card when no labels are selected", () => {
    expect(cardMatchesFilter(card([]), EMPTY_FILTER)).toBe(true);
    expect(cardMatchesFilter(card(["l1"]), EMPTY_FILTER)).toBe(true);
  });

  it("matches a card carrying any selected label (OR semantics)", () => {
    const filter = { labelIds: ["l1", "l2"] };
    expect(cardMatchesFilter(card(["l1"]), filter)).toBe(true);
    expect(cardMatchesFilter(card(["l2", "l3"]), filter)).toBe(true);
    expect(cardMatchesFilter(card(["l1", "l2"]), filter)).toBe(true);
  });

  it("rejects a card with none of the selected labels", () => {
    expect(cardMatchesFilter(card(["l3"]), { labelIds: ["l1", "l2"] })).toBe(false);
    expect(cardMatchesFilter(card([]), { labelIds: ["l1"] })).toBe(false);
  });
});

describe("availableLabels", () => {
  const label = (id: string, name: string, color = "#000") => ({ id, name, color });

  it("collects distinct labels across all lists and cards", () => {
    const lists = [
      { cards: [{ labels: [label("a", "Alpha")] }, { labels: [label("b", "Bravo")] }] },
      { cards: [{ labels: [label("a", "Alpha"), label("c", "Charlie")] }] },
    ];
    expect(availableLabels(lists).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by name, case-insensitively stable", () => {
    const lists = [
      { cards: [{ labels: [label("z", "Zebra"), label("a", "apple"), label("m", "Mango")] }] },
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
    const result = availableLabels(lists);
    expect(result).toHaveLength(1);
    expect(result[0].color).toBe("#111");
  });
});
