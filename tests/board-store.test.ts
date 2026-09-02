import { beforeEach, describe, expect, it } from "vitest";

import {
  useBoardStore,
  type ListWithCards,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

function makeLists(): ListWithCards[] {
  return [
    {
      id: "list-1",
      title: "To Do",
      boardId: "board-1",
      position: 16384,
      moveRevision: 0,
      cards: [],
    },
    {
      id: "list-2",
      title: "Doing",
      boardId: "board-1",
      position: 32768,
      moveRevision: 0,
      cards: [],
    },
    {
      id: "list-3",
      title: "Done",
      boardId: "board-1",
      position: 49152,
      moveRevision: 0,
      cards: [],
    },
  ];
}

function card(
  id: string,
  listId: string,
  position: number,
  moveRevision = 0,
  title?: string,
): ListWithCards["cards"][number] {
  return {
    id,
    listId,
    title: title ?? id,
    position,
    moveRevision,
    coverImage: null,
    priority: null,
    dueDate: null,
    completedAt: null,
    updatedAt: new Date(0),
    labels: [],
    members: [],
    memberCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
  };
}

function listOrder(): string[] {
  return useBoardStore.getState().lists.map((list) => list.id);
}

describe("drag-defer reconciliation", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("starts with isDragging false and no pending resync", () => {
    expect(useBoardStore.getState().isDragging).toBe(false);
    expect(useBoardStore.getState().pendingResync).toBe(false);
  });

  it("setDragging toggles the drag flag", () => {
    useBoardStore.getState().setDragging(true);
    expect(useBoardStore.getState().isDragging).toBe(true);
    useBoardStore.getState().setDragging(false);
    expect(useBoardStore.getState().isDragging).toBe(false);
  });

  it("consumeResync returns false and stays clear when nothing was deferred", () => {
    expect(useBoardStore.getState().consumeResync()).toBe(false);
    expect(useBoardStore.getState().pendingResync).toBe(false);
  });

  it("markResyncPending then consumeResync returns true once, then resets", () => {
    useBoardStore.getState().markResyncPending();
    expect(useBoardStore.getState().pendingResync).toBe(true);
    expect(useBoardStore.getState().consumeResync()).toBe(true);
    expect(useBoardStore.getState().consumeResync()).toBe(false);
  });

  it("reset clears drag state", () => {
    useBoardStore.getState().setDragging(true);
    useBoardStore.getState().markResyncPending();
    useBoardStore.getState().reset();
    expect(useBoardStore.getState().isDragging).toBe(false);
    expect(useBoardStore.getState().pendingResync).toBe(false);
  });
});

describe("applyRemoteListMoved", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("re-sorts lists by the new position", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    // Move list-1 to the end (between list-3 and the tail).
    useBoardStore.getState().applyRemoteListMoved({
      boardId: "board-1",
      listId: "list-1",
      position: 65536,
      moveRevision: 1,
    });

    expect(listOrder()).toEqual(["list-2", "list-3", "list-1"]);
    const moved = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-1")!;
    expect(moved.position).toBe(65536);
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListMoved({
      boardId: "board-2",
      listId: "list-1",
      position: 65536,
      moveRevision: 1,
    });

    expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
    expect(
      useBoardStore.getState().lists.find((list) => list.id === "list-1")!.position,
    ).toBe(16384);
  });

  it("is a no-op when the list is not found", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListMoved({
      boardId: "board-1",
      listId: "list-missing",
      position: 1,
      moveRevision: 1,
    });

    expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
  });

  it("is idempotent when the same move is re-applied", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    const move = {
      boardId: "board-1",
      listId: "list-3",
      position: 8192,
      moveRevision: 1,
    } as const;

    useBoardStore.getState().applyRemoteListMoved(move);
    const orderAfterFirst = listOrder();
    expect(orderAfterFirst).toEqual(["list-3", "list-1", "list-2"]);

    useBoardStore.getState().applyRemoteListMoved(move);
    expect(listOrder()).toEqual(orderAfterFirst);
    expect(
      useBoardStore.getState().lists.find((list) => list.id === "list-3")!.position,
    ).toBe(8192);
  });

  it("self-echo dedupe: a move to the already-reflected position is a true no-op", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });
    const before = useBoardStore.getState().lists;

    // list-1 is already at 16384 — the actor's own echo; no-op, same
    // reference, so no re-render is triggered.
    useBoardStore.getState().applyRemoteListMoved({
      boardId: "board-1",
      listId: "list-1",
      position: 16384,
      moveRevision: 0,
    });

    expect(useBoardStore.getState().lists).toBe(before);
  });
});

describe("applyRemoteListCreated", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("inserts the new list and sorts by position", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    // position 24576 falls between list-1 (16384) and list-2 (32768).
    useBoardStore.getState().applyRemoteListCreated({
      boardId: "board-1",
      list: {
        id: "list-new",
        title: "Review",
        boardId: "board-1",
        position: 24576,
        moveRevision: 0,
      },
    });

    expect(listOrder()).toEqual(["list-1", "list-new", "list-2", "list-3"]);
    const inserted = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-new")!;
    expect(inserted.cards).toEqual([]);
  });

  it("is a no-op (dedupe by id) when the same created event is re-applied", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    const created = {
      boardId: "board-1",
      list: {
        id: "list-new",
        title: "Review",
        boardId: "board-1",
        position: 24576,
        moveRevision: 0,
      },
    } as const;

    useBoardStore.getState().applyRemoteListCreated(created);
    const orderAfterFirst = listOrder();
    expect(orderAfterFirst).toEqual(["list-1", "list-new", "list-2", "list-3"]);

    useBoardStore.getState().applyRemoteListCreated(created);
    expect(listOrder()).toEqual(orderAfterFirst);
    expect(
      useBoardStore.getState().lists.filter((list) => list.id === "list-new"),
    ).toHaveLength(1);
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListCreated({
      boardId: "board-2",
      list: {
        id: "list-new",
        title: "Review",
        boardId: "board-2",
        position: 24576,
        moveRevision: 0,
      },
    });

    expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
  });

  it("handles restored list snapshot payload by inserting empty list sorted by position", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListCreated({
      boardId: "board-1",
      list: {
        id: "list-restored",
        title: "Restored List",
        boardId: "board-1",
        position: 24576,
        moveRevision: 0,
      },
    });

    expect(listOrder()).toEqual(["list-1", "list-restored", "list-2", "list-3"]);
    const restored = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-restored")!;
    expect(restored.cards).toEqual([]);
  });
});

describe("applyRemoteListUpdated", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("patches the title only", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListUpdated({
      boardId: "board-1",
      listId: "list-1",
      title: "Backlog",
    });

    const updated = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-1")!;
    expect(updated.title).toBe("Backlog");
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListUpdated({
      boardId: "board-2",
      listId: "list-1",
      title: "Backlog",
    });

    const list = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-1")!;
    expect(list.title).toBe("To Do");
  });

  it("is idempotent when the same update is re-applied", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    const update = {
      boardId: "board-1",
      listId: "list-1",
      title: "Backlog",
    } as const;

    useBoardStore.getState().applyRemoteListUpdated(update);
    useBoardStore.getState().applyRemoteListUpdated(update);

    const list = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-1")!;
    expect(list.title).toBe("Backlog");
  });
});

describe("applyRemoteListDeleted", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("removes the list and its cards", () => {
    const lists = makeLists();
    lists[0].cards = [card("card-1", "list-1", 16384)];
    useBoardStore.setState({ boardId: "board-1", lists });

    useBoardStore.getState().applyRemoteListDeleted({
      boardId: "board-1",
      listId: "list-1",
    });

    expect(listOrder()).toEqual(["list-2", "list-3"]);
    expect(
      useBoardStore.getState().lists.some((list) => list.id === "list-1"),
    ).toBe(false);
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListDeleted({
      boardId: "board-2",
      listId: "list-1",
    });

    expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
  });

  it("is a safe no-op when deleting a missing list id", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListDeleted({
      boardId: "board-1",
      listId: "list-missing",
    });

    expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
  });
});

function makeListsWithCards(): ListWithCards[] {
  const lists = makeLists();
  lists[0].cards = [card("card-a", "list-1", 16384, 0, "Alpha"), card("card-c", "list-1", 49152, 0, "Charlie")];
  lists[1].cards = [card("card-b", "list-2", 16384, 0, "Bravo")];
  return lists;
}

function cardsIn(listId: string) {
  return useBoardStore
    .getState()
    .lists.find((list) => list.id === listId)!
    .cards;
}

const selectedCardFor = (cardId: string, title: string) => ({
  card: {
    id: cardId,
    listId: "list-1",
    title,
    description: null,
    estimateHours: null,
    dueDate: null,
    completedAt: null,
    coverImage: null,
    priority: null,
    updatedAt: new Date(),
  },
  comments: [],
  activity: [],
  attachments: [],
  assignees: [],
  assignableMembers: [],
  labels: [],
});

describe("applyRemoteCardMoved", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("moves a card to another list and sorts the destination by position", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    // card-a (list-1) → list-2 at position 24576, after card-b (16384).
    useBoardStore.getState().applyRemoteCardMoved({
      boardId: "board-1",
      cardId: "card-a",
      listId: "list-2",
      position: 24576,
      moveRevision: 1,
    });

    expect(cardsIn("list-1").map((c) => c.id)).toEqual(["card-c"]);
    expect(cardsIn("list-2").map((c) => c.id)).toEqual(["card-b", "card-a"]);
    const moved = cardsIn("list-2").find((c) => c.id === "card-a")!;
    expect(moved.listId).toBe("list-2");
    expect(moved.position).toBe(24576);
  });

  it("self-echo dedupe: a move already reflected at the canonical position is a true no-op", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });
    const before = useBoardStore.getState().lists;

    // card-b already sits in list-2 at 16384 — the actor's own echo: no-op,
    // same reference (no re-render).
    useBoardStore.getState().applyRemoteCardMoved({
      boardId: "board-1",
      cardId: "card-b",
      listId: "list-2",
      position: 16384,
      moveRevision: 0,
    });

    expect(useBoardStore.getState().lists).toBe(before);
  });

  it("still applies when the card is in the target list but at a stale position", () => {
    // Simulates the actor's optimistic cross-list commit: card-a was placed in
    // list-2 by index but kept its old position (99999). The echo carries the
    // canonical float-gap position and MUST apply to correct it — otherwise a
    // later remote re-sort would misorder the board.
    const lists = makeListsWithCards();
    lists[0].cards = [card("card-c", "list-1", 49152)];
    lists[1].cards = [card("card-b", "list-2", 16384), card("card-a", "list-2", 99999)];
    useBoardStore.setState({ boardId: "board-1", lists });

    useBoardStore.getState().applyRemoteCardMoved({
      boardId: "board-1",
      cardId: "card-a",
      listId: "list-2",
      position: 8192,
      moveRevision: 1,
    });

    expect(cardsIn("list-2").map((c) => c.id)).toEqual(["card-a", "card-b"]);
    expect(cardsIn("list-2").find((c) => c.id === "card-a")!.position).toBe(8192);
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });
    const before = useBoardStore.getState().lists;

    useBoardStore.getState().applyRemoteCardMoved({
      boardId: "board-2",
      cardId: "card-a",
      listId: "list-2",
      position: 24576,
      moveRevision: 1,
    });

    expect(useBoardStore.getState().lists).toBe(before);
  });
});

describe("applyRemoteCardCreated", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("appends the card to the matching list and sorts by position", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    // position 32768 falls between card-a (16384) and card-c (49152).
    useBoardStore.getState().applyRemoteCardCreated({
      boardId: "board-1",
      card: { id: "card-new", listId: "list-1", title: "Bravo-ish", position: 32768 },
    });

    expect(cardsIn("list-1").map((card) => card.id)).toEqual([
      "card-a",
      "card-new",
      "card-c",
    ]);
  });

  it("is a no-op (dedupe by id) when the card already exists in any list", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardCreated({
      boardId: "board-1",
      card: { id: "card-a", listId: "list-1", title: "Alpha", position: 16384 },
    });

    expect(cardsIn("list-1").filter((card) => card.id === "card-a")).toHaveLength(1);
    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-a", "card-c"]);
  });

  it("is a no-op when the target list is not present", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardCreated({
      boardId: "board-1",
      card: { id: "card-new", listId: "list-missing", title: "Nope", position: 1 },
    });

    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-a", "card-c"]);
    expect(cardsIn("list-2").map((card) => card.id)).toEqual(["card-b"]);
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardCreated({
      boardId: "board-2",
      card: { id: "card-new", listId: "list-1", title: "Nope", position: 1 },
    });

    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-a", "card-c"]);
  });

  it("preserves dueDate/priority fidelity from the payload (US-083 W7 quick capture)", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardCreated({
      boardId: "board-1",
      card: {
        id: "card-new",
        listId: "list-1",
        title: "Captured",
        position: 32768,
        dueDate: "2026-08-15T00:00:00.000Z",
        priority: "URGENT",
      },
    });

    const card = cardsIn("list-1").find((c) => c.id === "card-new");
    expect(card).toBeDefined();
    expect(card!.priority).toBe("URGENT");
    expect(card!.dueDate).toEqual(new Date("2026-08-15T00:00:00.000Z"));
  });

  it("falls back to null when a pre-W7 payload carries no dueDate/priority (absent-field fallback)", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardCreated({
      boardId: "board-1",
      card: {
        id: "card-legacy",
        listId: "list-1",
        title: "Legacy",
        position: 24576,
      },
    });

    const card = cardsIn("list-1").find((c) => c.id === "card-legacy");
    expect(card).toBeDefined();
    expect(card!.priority).toBeNull();
    expect(card!.dueDate).toBeNull();
  });
});

describe("applyRemoteCardUpdated", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("patches the title in place across lists", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardUpdated({
      boardId: "board-1",
      cardId: "card-b",
      title: "Bravo renamed",
    });

    expect(cardsIn("list-2").find((card) => card.id === "card-b")!.title).toBe(
      "Bravo renamed",
    );
  });

  it("patches selectedCard.card.title when it is the selected card", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });

    useBoardStore.getState().applyRemoteCardUpdated({
      boardId: "board-1",
      cardId: "card-a",
      title: "Alpha renamed",
    });

    expect(cardsIn("list-1").find((card) => card.id === "card-a")!.title).toBe(
      "Alpha renamed",
    );
    expect(useBoardStore.getState().selectedCard!.card.title).toBe("Alpha renamed");
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardUpdated({
      boardId: "board-2",
      cardId: "card-a",
      title: "Nope",
    });

    expect(cardsIn("list-1").find((card) => card.id === "card-a")!.title).toBe("Alpha");
  });

  it("is idempotent when the same update is re-applied", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    const update = {
      boardId: "board-1",
      cardId: "card-a",
      title: "Alpha v2",
    } as const;

    useBoardStore.getState().applyRemoteCardUpdated(update);
    useBoardStore.getState().applyRemoteCardUpdated(update);

    expect(cardsIn("list-1").find((card) => card.id === "card-a")!.title).toBe("Alpha v2");
  });
});

describe("applyRemoteCardArchived", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("removes the card from its list", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardArchived({
      boardId: "board-1",
      cardId: "card-a",
    });

    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-c"]);
  });

  it("clears selectedCardId and selectedCard when the archived card was selected", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });

    useBoardStore.getState().applyRemoteCardArchived({
      boardId: "board-1",
      cardId: "card-a",
    });

    expect(useBoardStore.getState().selectedCardId).toBeNull();
    expect(useBoardStore.getState().selectedCard).toBeNull();
    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-c"]);
  });

  it("leaves selection intact when a different card is archived", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });

    useBoardStore.getState().applyRemoteCardArchived({
      boardId: "board-1",
      cardId: "card-b",
    });

    expect(useBoardStore.getState().selectedCardId).toBe("card-a");
    expect(useBoardStore.getState().selectedCard).not.toBeNull();
    expect(cardsIn("list-2").map((card) => card.id)).toEqual([]);
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardArchived({
      boardId: "board-2",
      cardId: "card-a",
    });

    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-a", "card-c"]);
  });
});

describe("applyRemoteCardLabelsUpdated", () => {
  const RED = { id: "label-red", name: "Bug", color: "#B04632" };
  const BLUE = { id: "label-blue", name: "UX", color: "#0079BF" };

  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("replaces a card's label set in place without moving it", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-a",
      labels: [RED, BLUE],
    });

    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-a", "card-c"]);
    expect(cardsIn("list-1").find((card) => card.id === "card-a")!.labels).toEqual([RED, BLUE]);
    expect(cardsIn("list-1").find((card) => card.id === "card-c")!.labels).toEqual([]);
  });

  it("preserves the reference of cards it does not touch", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });
    const cardCBefore = cardsIn("list-1").find((card) => card.id === "card-c");

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-a",
      labels: [RED],
    });

    expect(cardsIn("list-1").find((card) => card.id === "card-c")).toBe(cardCBefore);
  });

  it("self-echo dedupe: no-op when the label set already matches (same refs kept)", () => {
    const lists = makeListsWithCards();
    lists[0].cards[0].labels = [RED];
    useBoardStore.setState({ boardId: "board-1", lists });
    const listsBefore = useBoardStore.getState().lists;

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-a",
      labels: [RED],
    });

    // Identical id set → state object unchanged (no re-render).
    expect(useBoardStore.getState().lists).toBe(listsBefore);
  });

  it("applies a rename/recolor even when the label id set is unchanged (US-010)", () => {
    const lists = makeListsWithCards();
    lists[0].cards[0].labels = [RED];
    useBoardStore.setState({ boardId: "board-1", lists });
    const listsBefore = useBoardStore.getState().lists;

    // Same id, new name + color (a label rename/recolor re-emitted per card).
    const RENAMED = { id: "label-red", name: "Critical", color: "#E2B203" };
    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-a",
      labels: [RENAMED],
    });

    // Must NOT be deduped as a self-echo: the chip snapshot updates in place.
    expect(useBoardStore.getState().lists).not.toBe(listsBefore);
    expect(cardsIn("list-1").find((card) => card.id === "card-a")!.labels).toEqual([RENAMED]);
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-2",
      cardId: "card-a",
      labels: [RED],
    });

    expect(cardsIn("list-1").find((card) => card.id === "card-a")!.labels).toEqual([]);
  });

  it("is a safe no-op when the card id is not on the board", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-missing",
      labels: [RED],
    });

    expect(cardsIn("list-1").map((card) => card.id)).toEqual(["card-a", "card-c"]);
  });

  it("patches selectedCard.labels when the card is open in the detail sheet (F4)", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-a",
      labels: [RED, BLUE],
    });

    expect(cardsIn("list-1").find((card) => card.id === "card-a")!.labels).toEqual([RED, BLUE]);
    expect(useBoardStore.getState().selectedCard!.labels).toEqual([RED, BLUE]);
  });

  it("leaves the open sheet's labels untouched when a different card's labels change (F4)", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-b",
      labels: [BLUE],
    });

    expect(useBoardStore.getState().selectedCard!.labels).toEqual([]);
    expect(cardsIn("list-2").find((card) => card.id === "card-b")!.labels).toEqual([BLUE]);
  });

  it("self-echo dedupe also skips the selectedCard patch when the sets already match (F4)", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: { ...selectedCardFor("card-a", "Alpha"), labels: [RED] },
    });
    // The list face already carries the same set — the actor's own echo.
    const lists = useBoardStore.getState().lists;
    lists[0].cards[0].labels = [RED];
    useBoardStore.setState({ lists });
    const listsBefore = useBoardStore.getState().lists;
    const selectedBefore = useBoardStore.getState().selectedCard;

    useBoardStore.getState().applyRemoteCardLabelsUpdated({
      boardId: "board-1",
      cardId: "card-a",
      labels: [RED],
    });

    expect(useBoardStore.getState().lists).toBe(listsBefore);
    expect(useBoardStore.getState().selectedCard).toBe(selectedBefore);
  });
});

describe("applyRemoteCardMetaUpdated (F3)", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("patches dueDate, priority and coverImage on the card face in place (no reorder)", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardMetaUpdated({
      boardId: "board-1",
      cardId: "card-a",
      fields: {
        dueDate: "2026-08-15T12:00:00.000Z",
        priority: "URGENT",
        coverImage: "https://cdn.example/cover.png",
      },
    });

    const card = cardsIn("list-1").find((c) => c.id === "card-a")!;
    expect(card.dueDate).toEqual(new Date("2026-08-15T12:00:00.000Z"));
    expect(card.priority).toBe("URGENT");
    expect(card.coverImage).toBe("https://cdn.example/cover.png");
    // Order is untouched — in-place patch.
    expect(cardsIn("list-1").map((c) => c.id)).toEqual(["card-a", "card-c"]);
  });

  it("patches estimateHours and dueDate on the open detail sheet", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });

    useBoardStore.getState().applyRemoteCardMetaUpdated({
      boardId: "board-1",
      cardId: "card-a",
      fields: {
        estimateHours: 8,
        dueDate: "2026-08-15T12:00:00.000Z",
      },
    });

    const sel = useBoardStore.getState().selectedCard!;
    expect(sel.card.estimateHours).toBe(8);
    expect(sel.card.dueDate).toEqual(new Date("2026-08-15T12:00:00.000Z"));
    // The list face gained dueDate too (estimate is sheet-only).
    expect(cardsIn("list-1").find((c) => c.id === "card-a")!.dueDate).toEqual(
      new Date("2026-08-15T12:00:00.000Z"),
    );
  });

  it("clears fields when the payload carries null (due date removed, priority reset)", () => {
    const lists = makeListsWithCards();
    lists[0].cards[0] = {
      ...lists[0].cards[0],
      dueDate: new Date("2026-08-15T12:00:00.000Z"),
      priority: "HIGH",
    };
    useBoardStore.setState({ boardId: "board-1", lists });

    useBoardStore.getState().applyRemoteCardMetaUpdated({
      boardId: "board-1",
      cardId: "card-a",
      fields: { dueDate: null, priority: null },
    });

    const card = cardsIn("list-1").find((c) => c.id === "card-a")!;
    expect(card.dueDate).toBeNull();
    expect(card.priority).toBeNull();
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });
    const before = useBoardStore.getState().lists;

    useBoardStore.getState().applyRemoteCardMetaUpdated({
      boardId: "board-2",
      cardId: "card-a",
      fields: { priority: "URGENT" },
    });

    expect(useBoardStore.getState().lists).toBe(before);
    expect(cardsIn("list-1").find((c) => c.id === "card-a")!.priority).toBeNull();
  });

  it("is a safe no-op when the card is not on the board and not selected", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });
    const before = useBoardStore.getState().lists;

    useBoardStore.getState().applyRemoteCardMetaUpdated({
      boardId: "board-1",
      cardId: "card-missing",
      fields: { priority: "URGENT" },
    });

    expect(useBoardStore.getState().lists).toBe(before);
  });

  it("self-echo dedupe: an identical patch is a true no-op (no re-render)", () => {
    const lists = makeListsWithCards();
    lists[0].cards[0] = {
      ...lists[0].cards[0],
      priority: "MEDIUM",
      coverImage: "https://cdn.example/cover.png",
    };
    useBoardStore.setState({ boardId: "board-1", lists });
    const before = useBoardStore.getState().lists;

    useBoardStore.getState().applyRemoteCardMetaUpdated({
      boardId: "board-1",
      cardId: "card-a",
      fields: { priority: "MEDIUM", coverImage: "https://cdn.example/cover.png" },
    });

    expect(useBoardStore.getState().lists).toBe(before);
  });

  it("applies when only the sheet-only estimate field changed and the card is selected", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });

    useBoardStore.getState().applyRemoteCardMetaUpdated({
      boardId: "board-1",
      cardId: "card-a",
      fields: { estimateHours: 3 },
    });

    expect(useBoardStore.getState().selectedCard!.card.estimateHours).toBe(3);
    // List face has no estimate field — its values are untouched.
    const card = cardsIn("list-1").find((c) => c.id === "card-a")!;
    expect(card.priority).toBeNull();
    expect(card.coverImage).toBeNull();
  });
});

describe("applyRemoteCardMembersUpdated", () => {
  const ALICE = { id: "u-alice", name: "Alice", email: "alice@x", image: null };
  const BOB = { id: "u-bob", name: "Bob", email: "bob@x", image: null };

  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  function openCardWith(
    assignees: Array<{ id: string; name: string; email: string; image: string | null }>,
    assignableMembers: Array<{ id: string; name: string; email: string; image: string | null }>,
  ) {
    const selectedCard = { ...selectedCardFor("card-a", "Card A"), assignees, assignableMembers };
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard,
    });
  }

  it("adds a remotely-assigned member to the open card and drops them from the assignable pool", () => {
    openCardWith([], [ALICE, BOB]);

    useBoardStore.getState().applyRemoteCardMembersUpdated({
      boardId: "board-1",
      cardId: "card-a",
      members: [BOB],
    });

    const sel = useBoardStore.getState().selectedCard!;
    expect(sel.assignees).toEqual([BOB]);
    // BOB left the pool; ALICE remains assignable.
    expect(sel.assignableMembers.map((m) => m.id)).toEqual(["u-alice"]);
  });

  it("returns a remotely-removed member to the assignable pool", () => {
    openCardWith([BOB], [ALICE]);

    useBoardStore.getState().applyRemoteCardMembersUpdated({
      boardId: "board-1",
      cardId: "card-a",
      members: [],
    });

    const sel = useBoardStore.getState().selectedCard!;
    expect(sel.assignees).toEqual([]);
    // BOB returns to the pool alongside ALICE (deduped, no duplicates).
    expect(sel.assignableMembers.map((m) => m.id).sort()).toEqual(["u-alice", "u-bob"]);
  });

  it("self-echo dedupe: no-op when the assignee id set already matches (same ref kept)", () => {
    openCardWith([BOB], [ALICE]);
    const before = useBoardStore.getState().selectedCard;

    useBoardStore.getState().applyRemoteCardMembersUpdated({
      boardId: "board-1",
      cardId: "card-a",
      members: [BOB],
    });

    expect(useBoardStore.getState().selectedCard).toBe(before);
  });

  it("is a no-op when the event targets a different card than the open one", () => {
    openCardWith([], [ALICE, BOB]);

    useBoardStore.getState().applyRemoteCardMembersUpdated({
      boardId: "board-1",
      cardId: "card-other",
      members: [BOB],
    });

    expect(useBoardStore.getState().selectedCard!.assignees).toEqual([]);
  });

  it("is a no-op when no card detail is open", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: null,
      selectedCard: null,
    });

    useBoardStore.getState().applyRemoteCardMembersUpdated({
      boardId: "board-1",
      cardId: "card-a",
      members: [BOB],
    });

    expect(useBoardStore.getState().selectedCard).toBeNull();
  });

  it("is a no-op when the payload boardId does not match", () => {
    openCardWith([], [ALICE, BOB]);

    useBoardStore.getState().applyRemoteCardMembersUpdated({
      boardId: "board-2",
      cardId: "card-a",
      members: [BOB],
    });

    expect(useBoardStore.getState().selectedCard!.assignees).toEqual([]);
  });
});

describe("applyRemoteCardCompletionUpdated (US-045)", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("sets completedAt on the card face (rehydrating the ISO string to a Date)", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });
    const iso = "2026-07-03T00:00:00.000Z";

    useBoardStore.getState().applyRemoteCardCompletionUpdated({
      boardId: "board-1",
      cardId: "card-a",
      completedAt: iso,
    });

    const card = cardsIn("list-1").find((c) => c.id === "card-a")!;
    expect(card.completedAt).toEqual(new Date(iso));
  });

  it("clears completedAt on reopen (null payload)", () => {
    const lists = makeListsWithCards();
    lists[0].cards[0].completedAt = new Date("2026-07-01T00:00:00.000Z");
    useBoardStore.setState({ boardId: "board-1", lists });

    useBoardStore.getState().applyRemoteCardCompletionUpdated({
      boardId: "board-1",
      cardId: "card-a",
      completedAt: null,
    });

    expect(cardsIn("list-1").find((c) => c.id === "card-a")!.completedAt).toBeNull();
  });

  it("also patches the open detail sheet when it is the same card", () => {
    useBoardStore.setState({
      boardId: "board-1",
      lists: makeListsWithCards(),
      selectedCardId: "card-a",
      selectedCard: selectedCardFor("card-a", "Alpha"),
    });
    const iso = "2026-07-03T00:00:00.000Z";

    useBoardStore.getState().applyRemoteCardCompletionUpdated({
      boardId: "board-1",
      cardId: "card-a",
      completedAt: iso,
    });

    expect(useBoardStore.getState().selectedCard!.card.completedAt).toEqual(new Date(iso));
  });

  it("is a no-op when the payload boardId does not match", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeListsWithCards() });

    useBoardStore.getState().applyRemoteCardCompletionUpdated({
      boardId: "board-2",
      cardId: "card-a",
      completedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(cardsIn("list-1").find((c) => c.id === "card-a")!.completedAt).toBeNull();
  });
});

describe("decision 0032 — moveRevision echo semantics", () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
  });

  it("normalizes omitted legacy list/card revisions when seeding the store", () => {
    const current = makeListsWithCards();
    const legacy = current.map((list) => ({
      ...list,
      moveRevision: undefined,
      cards: list.cards.map((card) => ({ ...card, moveRevision: undefined })),
    })) as never;

    useBoardStore.getState().setLists(legacy);

    expect(useBoardStore.getState().lists.every((list) => list.moveRevision === 0)).toBe(true);
    expect(
      useBoardStore.getState().lists.every((list) =>
        list.cards.every((card) => card.moveRevision === 0),
      ),
    ).toBe(true);
  });

  describe("applyRemoteCardMoved revision gates", () => {
    function seedMovedCard(moveRevision: number) {
      const lists = makeListsWithCards();
      // The base fixture has card-a in list-1; drop it so the card lives
      // ONLY in list-2 at the seeded revision (no duplicate id).
      lists[0].cards = lists[0].cards.filter((c) => c.id !== "card-a");
      lists[1].cards = [card("card-b", "list-2", 16384), card("card-a", "list-2", 8192, moveRevision)];
      useBoardStore.setState({ boardId: "board-1", lists });
      return lists;
    }

    it("rejects a STALE echo (lower revision) — a newer move already applied", () => {
      seedMovedCard(3); // store already knows revision 3
      const before = useBoardStore.getState().lists;

      // A delayed echo from an older move (revision 2) must not clobber it.
      useBoardStore.getState().applyRemoteCardMoved({
        boardId: "board-1",
        cardId: "card-a",
        listId: "list-1",
        position: 999,
        moveRevision: 2,
      });

      expect(useBoardStore.getState().lists).toBe(before);
    });

    it("dedupes the actor's own echo (equal revision, same list + position) without re-render", () => {
      seedMovedCard(1);
      const before = useBoardStore.getState().lists;

      useBoardStore.getState().applyRemoteCardMoved({
        boardId: "board-1",
        cardId: "card-a",
        listId: "list-2",
        position: 8192,
        moveRevision: 1,
      });

      expect(useBoardStore.getState().lists).toBe(before);
    });

    it("applies an equal-revision echo with a DIFFERENT position (canonical correction of an optimistic slot)", () => {
      // The actor optimistically placed card-a at 8192; the server computed the
      // canonical float-gap slot 24576 at the same revision. It MUST apply.
      seedMovedCard(1);

      useBoardStore.getState().applyRemoteCardMoved({
        boardId: "board-1",
        cardId: "card-a",
        listId: "list-2",
        position: 24576,
        moveRevision: 1,
      });

      const moved = cardsIn("list-2").find((c) => c.id === "card-a")!;
      expect(moved.position).toBe(24576);
      expect(moved.moveRevision).toBe(1);
    });

    it("normalizes an omitted legacy revision to zero at event ingress", () => {
      const lists = makeListsWithCards();
      useBoardStore.setState({ boardId: "board-1", lists });

      useBoardStore.getState().applyRemoteCardMoved({
        boardId: "board-1",
        cardId: "card-a",
        listId: "list-2",
        position: 24576,
      });

      const moved = cardsIn("list-2").find((card) => card.id === "card-a")!;
      expect(moved.moveRevision).toBe(0);
      expect(moved.position).toBe(24576);
    });

    it("applies a HIGHER-revision echo (a genuine cross-user move)", () => {
      seedMovedCard(1);

      useBoardStore.getState().applyRemoteCardMoved({
        boardId: "board-1",
        cardId: "card-a",
        listId: "list-1",
        position: 99999,
        moveRevision: 2,
      });

      const moved = cardsIn("list-1").find((c) => c.id === "card-a")!;
      expect(moved.listId).toBe("list-1");
      expect(moved.position).toBe(99999);
      expect(moved.moveRevision).toBe(2);
    });

  it("removes the source card when a cross-board destination is absent from the store", () => {
      seedMovedCard(0);
      useBoardStore.setState({
        selectedCardId: "card-a",
        selectedCard: selectedCardFor("card-a", "Alpha"),
      });

      useBoardStore.getState().applyRemoteCardMoved({
        boardId: "board-1",
        cardId: "card-a",
        listId: "list-missing",
        position: 1,
        moveRevision: 1,
      });

      expect(cardsIn("list-2").map((card) => card.id)).toEqual(["card-b"]);
      expect(useBoardStore.getState().selectedCardId).toBeNull();
      expect(useBoardStore.getState().selectedCard).toBeNull();
    });

    it("inserts a canonical cross-board snapshot when the destination has no local source card", () => {
      useBoardStore.setState({ boardId: "board-2", lists: makeListsWithCards() });

      useBoardStore.getState().applyRemoteCardMoved({
        boardId: "board-2",
        cardId: "card-new",
        listId: "list-2",
        position: 24576,
        moveRevision: 2,
        card: {
          id: "card-new",
          listId: "list-2",
          title: "Moved from another board",
          position: 24576,
          moveRevision: 2,
          dueDate: null,
          priority: null,
        },
      });

      expect(cardsIn("list-2").map((card) => card.id)).toEqual(["card-b", "card-new"]);
      expect(cardsIn("list-2").find((card) => card.id === "card-new")?.title).toBe(
        "Moved from another board",
      );
    });
  });

  describe("applyRemoteListMoved revision gates", () => {
    it("rejects a stale echo (lower revision)", () => {
      const lists = makeLists();
      lists[0].moveRevision = 3;
      useBoardStore.setState({ boardId: "board-1", lists });
      const before = useBoardStore.getState().lists;

      useBoardStore.getState().applyRemoteListMoved({
        boardId: "board-1",
        listId: "list-1",
        position: 1,
        moveRevision: 2,
      });

      expect(useBoardStore.getState().lists).toBe(before);
    });

    it("dedupes the actor's own echo (equal revision, same position)", () => {
      useBoardStore.setState({ boardId: "board-1", lists: makeLists() });
      const before = useBoardStore.getState().lists;

      useBoardStore.getState().applyRemoteListMoved({
        boardId: "board-1",
        listId: "list-2",
        position: 32768,
        moveRevision: 0,
      });

      expect(useBoardStore.getState().lists).toBe(before);
    });

    it("normalizes an omitted legacy revision to zero at event ingress", () => {
      useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

      useBoardStore.getState().applyRemoteListMoved({
        boardId: "board-1",
        listId: "list-1",
        position: 1,
      });

      const list = useBoardStore.getState().lists.find((item) => item.id === "list-1")!;
      expect(list.moveRevision).toBe(0);
      expect(list.position).toBe(1);
    });

    it("applies an equal-revision echo with a DIFFERENT position (canonical correction)", () => {
      const lists = makeLists();
      // Optimistic slot: list-1 already at 16384, server canonicalizes to 8192.
      lists[0].position = 16384;
      lists[0].moveRevision = 1;
      useBoardStore.setState({ boardId: "board-1", lists });

      useBoardStore.getState().applyRemoteListMoved({
        boardId: "board-1",
        listId: "list-1",
        position: 8192,
        moveRevision: 1,
      });

      expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
      expect(useBoardStore.getState().lists.find((l) => l.id === "list-1")!.position).toBe(8192);
      expect(useBoardStore.getState().lists.find((l) => l.id === "list-1")!.moveRevision).toBe(1);
    });

    it("applies a HIGHER-revision echo (cross-user move) and re-sorts", () => {
      useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

      useBoardStore.getState().applyRemoteListMoved({
        boardId: "board-1",
        listId: "list-1",
        position: 65536,
        moveRevision: 1,
      });

      expect(listOrder()).toEqual(["list-2", "list-3", "list-1"]);
      expect(useBoardStore.getState().lists.find((l) => l.id === "list-1")!.moveRevision).toBe(1);
    });
  });
});
