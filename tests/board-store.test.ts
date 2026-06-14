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
      isDone: false,
      position: 16384,
      cards: [],
    },
    {
      id: "list-2",
      title: "Doing",
      boardId: "board-1",
      isDone: false,
      position: 32768,
      cards: [],
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
    // Second consume returns false — the flag was cleared.
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
    });

    expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
  });

  it("is idempotent when the same move is re-applied", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    const move = {
      boardId: "board-1",
      listId: "list-3",
      position: 8192,
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
        isDone: false,
        position: 24576,
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
        isDone: false,
        position: 24576,
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
        isDone: false,
        position: 24576,
      },
    });

    expect(listOrder()).toEqual(["list-1", "list-2", "list-3"]);
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
    expect(updated.isDone).toBe(false);
  });

  it("patches isDone only", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListUpdated({
      boardId: "board-1",
      listId: "list-1",
      isDone: true,
    });

    const updated = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-1")!;
    expect(updated.isDone).toBe(true);
    expect(updated.title).toBe("To Do");
  });

  it("patches both title and isDone when both are present", () => {
    useBoardStore.setState({ boardId: "board-1", lists: makeLists() });

    useBoardStore.getState().applyRemoteListUpdated({
      boardId: "board-1",
      listId: "list-1",
      title: "Shipped",
      isDone: true,
    });

    const updated = useBoardStore
      .getState()
      .lists.find((list) => list.id === "list-1")!;
    expect(updated.title).toBe("Shipped");
    expect(updated.isDone).toBe(true);
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
    lists[0].cards = [
      { id: "card-1", listId: "list-1", title: "A", position: 16384 },
    ];
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
  lists[0].cards = [
    { id: "card-a", listId: "list-1", title: "Alpha", position: 16384 },
    { id: "card-c", listId: "list-1", title: "Charlie", position: 49152 },
  ];
  lists[1].cards = [
    { id: "card-b", listId: "list-2", title: "Bravo", position: 16384 },
  ];
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
    updatedAt: new Date(),
  },
  comments: [],
  activity: [],
  attachments: [],
  assignees: [],
  assignableMembers: [],
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
