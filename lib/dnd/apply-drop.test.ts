import { describe, expect, it } from "vitest";

import type { ListWithCards } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

import { translateCardDrop, translateListDrop } from "./apply-drop";

function makeLists(): ListWithCards[] {
  return [
    {
      id: "list-1",
      title: "To Do",
      boardId: "board-1",
      isDone: false,
      position: 16384,
      cards: [
        { id: "card-A", listId: "list-1", title: "A", position: 16384 },
        { id: "card-B", listId: "list-1", title: "B", position: 32768 },
        { id: "card-C", listId: "list-1", title: "C", position: 49152 },
      ],
    },
    {
      id: "list-2",
      title: "Doing",
      boardId: "board-1",
      isDone: false,
      position: 32768,
      cards: [
        { id: "card-D", listId: "list-2", title: "D", position: 16384 },
        { id: "card-E", listId: "list-2", title: "E", position: 32768 },
      ],
    },
    {
      id: "list-3",
      title: "Done",
      boardId: "board-1",
      isDone: true,
      position: 49152,
      cards: [],
    },
  ];
}

function cardIds(lists: ListWithCards[], listId: string): string[] {
  return lists.find((list) => list.id === listId)!.cards.map((card) => card.id);
}

describe("translateCardDrop — same list", () => {
  it("moves a card down within its list and reports the right neighbors", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-A",
      { droppableId: "list-1", index: 0 },
      { droppableId: "list-1", index: 2 },
    );

    expect(result.action).toBe("reorderCard");
    if (result.action !== "reorderCard") return;
    expect(cardIds(result.nextLists, "list-1")).toEqual(["card-B", "card-C", "card-A"]);
    expect(result.fields).toEqual({
      cardId: "card-A",
      prevCardId: "card-C",
      nextCardId: null,
    });
  });

  it("moves a card up within its list", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-C",
      { droppableId: "list-1", index: 2 },
      { droppableId: "list-1", index: 0 },
    );

    expect(result.action).toBe("reorderCard");
    if (result.action !== "reorderCard") return;
    expect(cardIds(result.nextLists, "list-1")).toEqual(["card-C", "card-A", "card-B"]);
    expect(result.fields).toEqual({
      cardId: "card-C",
      prevCardId: null,
      nextCardId: "card-A",
    });
  });

  it("reports both neighbors when dropped in the middle", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-A",
      { droppableId: "list-1", index: 0 },
      { droppableId: "list-1", index: 1 },
    );

    expect(result.action).toBe("reorderCard");
    if (result.action !== "reorderCard") return;
    // After removing A then inserting at index 1: [B, A, C]
    expect(cardIds(result.nextLists, "list-1")).toEqual(["card-B", "card-A", "card-C"]);
    expect(result.fields).toEqual({
      cardId: "card-A",
      prevCardId: "card-B",
      nextCardId: "card-C",
    });
  });

  it("is a no-op when dropped on the same index", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-B",
      { droppableId: "list-1", index: 1 },
      { droppableId: "list-1", index: 1 },
    );
    expect(result.action).toBe("none");
  });
});

describe("translateCardDrop — cross list", () => {
  it("moves a card to another list and sets targetListId + neighbors", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-A",
      { droppableId: "list-1", index: 0 },
      { droppableId: "list-2", index: 1 },
    );

    expect(result.action).toBe("moveCard");
    if (result.action !== "moveCard") return;
    expect(cardIds(result.nextLists, "list-1")).toEqual(["card-B", "card-C"]);
    expect(cardIds(result.nextLists, "list-2")).toEqual(["card-D", "card-A", "card-E"]);
    expect(result.fields).toEqual({
      cardId: "card-A",
      targetListId: "list-2",
      prevCardId: "card-D",
      nextCardId: "card-E",
    });
  });

  it("moves a card into an empty list — both neighbors null", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-D",
      { droppableId: "list-2", index: 0 },
      { droppableId: "list-3", index: 0 },
    );

    expect(result.action).toBe("moveCard");
    if (result.action !== "moveCard") return;
    expect(cardIds(result.nextLists, "list-3")).toEqual(["card-D"]);
    expect(result.fields).toEqual({
      cardId: "card-D",
      targetListId: "list-3",
      prevCardId: null,
      nextCardId: null,
    });
    // moved card's listId is rewritten to the destination list
    const moved = result.nextLists
      .find((list) => list.id === "list-3")!
      .cards.find((card) => card.id === "card-D")!;
    expect(moved.listId).toBe("list-3");
  });

  it("is a no-op when the moved id does not match the source slot", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-Z",
      { droppableId: "list-1", index: 0 },
      { droppableId: "list-2", index: 0 },
    );
    expect(result.action).toBe("none");
  });
});

describe("translateListDrop", () => {
  it("reorders a list and reports neighbors", () => {
    const lists = makeLists();
    const result = translateListDrop(
      lists,
      "list-1",
      { droppableId: "board", index: 0 },
      { droppableId: "board", index: 2 },
    );

    expect(result.action).toBe("reorderList");
    if (result.action !== "reorderList") return;
    expect(result.nextLists.map((list) => list.id)).toEqual(["list-2", "list-3", "list-1"]);
    expect(result.fields).toEqual({
      listId: "list-1",
      prevListId: "list-3",
      nextListId: null,
    });
  });

  it("reorders a list to the front", () => {
    const lists = makeLists();
    const result = translateListDrop(
      lists,
      "list-3",
      { droppableId: "board", index: 2 },
      { droppableId: "board", index: 0 },
    );

    expect(result.action).toBe("reorderList");
    if (result.action !== "reorderList") return;
    expect(result.nextLists.map((list) => list.id)).toEqual(["list-3", "list-1", "list-2"]);
    expect(result.fields).toEqual({
      listId: "list-3",
      prevListId: null,
      nextListId: "list-1",
    });
  });

  it("is a no-op when the index is unchanged", () => {
    const lists = makeLists();
    const result = translateListDrop(
      lists,
      "list-2",
      { droppableId: "board", index: 1 },
      { droppableId: "board", index: 1 },
    );
    expect(result.action).toBe("none");
  });
});

describe("immutability", () => {
  it("does not mutate the input lists or nested cards (card move)", () => {
    const lists = makeLists();
    const before = JSON.stringify(lists);
    translateCardDrop(
      lists,
      "card-A",
      { droppableId: "list-1", index: 0 },
      { droppableId: "list-2", index: 1 },
    );
    expect(JSON.stringify(lists)).toBe(before);
  });

  it("does not mutate the input lists (list reorder)", () => {
    const lists = makeLists();
    const before = JSON.stringify(lists);
    translateListDrop(
      lists,
      "list-1",
      { droppableId: "board", index: 0 },
      { droppableId: "board", index: 2 },
    );
    expect(JSON.stringify(lists)).toBe(before);
  });
});

// These assertions are the contract memoization relies on: lists (and cards)
// that did not change must be returned by the SAME reference, so memoized
// ListColumn / ListCardItem skip re-render. Lists that did change must be new
// references so React still re-renders them.
describe("reference preservation", () => {
  function byId(lists: ListWithCards[], id: string): ListWithCards {
    return lists.find((list) => list.id === id)!;
  }

  it("same-list move: only the mutated list is a new reference", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-A",
      { droppableId: "list-1", index: 0 },
      { droppableId: "list-1", index: 2 },
    );
    if (result.action !== "reorderCard") throw new Error("expected reorderCard");

    // Untouched lists: same reference.
    expect(byId(result.nextLists, "list-2")).toBe(byId(lists, "list-2"));
    expect(byId(result.nextLists, "list-3")).toBe(byId(lists, "list-3"));
    // Mutated list: new reference (and a new cards array).
    expect(byId(result.nextLists, "list-1")).not.toBe(byId(lists, "list-1"));
    expect(byId(result.nextLists, "list-1").cards).not.toBe(byId(lists, "list-1").cards);
    // Same-list move does not rewrite listId, so the moved card keeps its ref.
    const movedBefore = byId(lists, "list-1").cards[0];
    const movedAfter = byId(result.nextLists, "list-1").cards.find((c) => c.id === "card-A")!;
    expect(movedAfter).toBe(movedBefore);
  });

  it("cross-list move: only source and destination are new references", () => {
    const lists = makeLists();
    const result = translateCardDrop(
      lists,
      "card-A",
      { droppableId: "list-1", index: 0 },
      { droppableId: "list-2", index: 1 },
    );
    if (result.action !== "moveCard") throw new Error("expected moveCard");

    // Untouched list: same reference.
    expect(byId(result.nextLists, "list-3")).toBe(byId(lists, "list-3"));
    // Source + destination: new references.
    expect(byId(result.nextLists, "list-1")).not.toBe(byId(lists, "list-1"));
    expect(byId(result.nextLists, "list-2")).not.toBe(byId(lists, "list-2"));
    // Cards that did not move keep their references.
    const cardBBefore = byId(lists, "list-1").cards.find((c) => c.id === "card-B")!;
    const cardBAfter = byId(result.nextLists, "list-1").cards.find((c) => c.id === "card-B")!;
    expect(cardBAfter).toBe(cardBBefore);
    const cardDBefore = byId(lists, "list-2").cards.find((c) => c.id === "card-D")!;
    const cardDAfter = byId(result.nextLists, "list-2").cards.find((c) => c.id === "card-D")!;
    expect(cardDAfter).toBe(cardDBefore);
    // The moved card is a new reference (listId rewritten to the destination).
    const movedBefore = byId(lists, "list-1").cards.find((c) => c.id === "card-A")!;
    const movedAfter = byId(result.nextLists, "list-2").cards.find((c) => c.id === "card-A")!;
    expect(movedAfter).not.toBe(movedBefore);
    expect(movedAfter.listId).toBe("list-2");
  });

  it("list reorder: list objects are preserved, only array order changes", () => {
    const lists = makeLists();
    const result = translateListDrop(
      lists,
      "list-1",
      { droppableId: "board", index: 0 },
      { droppableId: "board", index: 2 },
    );
    if (result.action !== "reorderList") throw new Error("expected reorderList");

    // Reorder shuffles the array but reuses every list object reference.
    expect(byId(result.nextLists, "list-1")).toBe(byId(lists, "list-1"));
    expect(byId(result.nextLists, "list-2")).toBe(byId(lists, "list-2"));
    expect(byId(result.nextLists, "list-3")).toBe(byId(lists, "list-3"));
    // The array itself is a new reference.
    expect(result.nextLists).not.toBe(lists);
  });
});
