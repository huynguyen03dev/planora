import db from "./prisma";

// Float-gap positioning, consistent with lists/cards (see lib/dnd/apply-drop.ts).
// Slice 1 only appends (new items land at the end); reorder is a follow-up that
// will reuse the same neighbour math.
const CHECKLIST_POSITION_GAP = 16384;

export type ChecklistItemRecord = {
  id: string;
  checklistId: string;
  title: string;
  isCompleted: boolean;
  position: number;
};

export type ChecklistRecord = {
  id: string;
  cardId: string;
  title: string;
  position: number;
};

export type ChecklistWithItems = ChecklistRecord & {
  items: ChecklistItemRecord[];
};

/**
 * Workspace-scoping envelope for a checklist — its card, owning board, and the
 * board's workspace/archive state. Mirrors `getLabelWithBoard`: the Server Action
 * derives `workspaceId` from here so the permission check is on the real owner,
 * not on a client-supplied id.
 */
export type ChecklistScopeRecord = {
  id: string;
  cardId: string;
  boardId: string;
  cardArchived: boolean;
  /** US-074 Slice B2: true when the parent list is archived. */
  listArchived: boolean;
  board: { id: string; workspaceId: string; archivedAt: Date | null };
};

const ITEM_SELECT = {
  id: true,
  checklistId: true,
  title: true,
  isCompleted: true,
  position: true,
} as const;

/** All checklists on a card with their items, ordered by position. */
export async function getCardChecklists(
  cardId: string,
): Promise<ChecklistWithItems[]> {
  const rows = await db.checklist.findMany({
    where: { cardId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      cardId: true,
      title: true,
      position: true,
      items: {
        orderBy: { position: "asc" },
        select: ITEM_SELECT,
      },
    },
  });

  return rows;
}

function toScope(row: {
  id: string;
  cardId: string;
  card: {
    archivedAt: Date | null;
    list: {
      archivedAt: Date | null;
      boardId: string;
      board: { id: string; workspaceId: string; archivedAt: Date | null };
    };
  };
}): ChecklistScopeRecord {
  return {
    id: row.id,
    cardId: row.cardId,
    boardId: row.card.list.boardId,
    cardArchived: row.card.archivedAt !== null,
    listArchived: row.card.list.archivedAt !== null,
    board: row.card.list.board,
  };
}

const SCOPE_CARD_SELECT = {
  archivedAt: true,
  list: {
    select: {
      archivedAt: true,
      boardId: true,
      board: { select: { id: true, workspaceId: true, archivedAt: true } },
    },
  },
} as const;

/** Resolve a checklist to its card/board/workspace for permission scoping. */
export async function getChecklistWithCard(
  checklistId: string,
): Promise<ChecklistScopeRecord | null> {
  const row = await db.checklist.findUnique({
    where: { id: checklistId },
    select: {
      id: true,
      cardId: true,
      card: { select: SCOPE_CARD_SELECT },
    },
  });

  return row ? toScope(row) : null;
}

/** Resolve a checklist item to its card/board/workspace for permission scoping. */
export async function getChecklistItemWithCard(
  itemId: string,
): Promise<(ChecklistScopeRecord & { itemId: string; checklistId: string }) | null> {
  const row = await db.checklistItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      checklistId: true,
      checklist: {
        select: {
          id: true,
          cardId: true,
          card: { select: SCOPE_CARD_SELECT },
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  return {
    ...toScope(row.checklist),
    itemId: row.id,
    checklistId: row.checklistId,
  };
}

/** Create a checklist on a card, appended after any existing checklists. */
export async function createChecklist(data: {
  cardId: string;
  title: string;
}): Promise<ChecklistWithItems> {
  const last = await db.checklist.findFirst({
    where: { cardId: data.cardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + CHECKLIST_POSITION_GAP;

  const created = await db.checklist.create({
    data: { cardId: data.cardId, title: data.title, position },
    select: { id: true, cardId: true, title: true, position: true },
  });

  return { ...created, items: [] };
}

/** Delete a checklist; its items cascade away via the schema relation. */
export async function deleteChecklist(checklistId: string): Promise<void> {
  await db.checklist.delete({ where: { id: checklistId } });
}

/** Add an item to a checklist, appended after any existing items. */
export async function createChecklistItem(data: {
  checklistId: string;
  title: string;
}): Promise<ChecklistItemRecord> {
  const last = await db.checklistItem.findFirst({
    where: { checklistId: data.checklistId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + CHECKLIST_POSITION_GAP;

  return db.checklistItem.create({
    data: { checklistId: data.checklistId, title: data.title, position },
    select: ITEM_SELECT,
  });
}

/** Set an item's completion state. */
export async function setChecklistItemCompleted(
  itemId: string,
  isCompleted: boolean,
): Promise<ChecklistItemRecord> {
  return db.checklistItem.update({
    where: { id: itemId },
    data: { isCompleted },
    select: ITEM_SELECT,
  });
}

/** Delete a single checklist item. */
export async function deleteChecklistItem(itemId: string): Promise<void> {
  await db.checklistItem.delete({ where: { id: itemId } });
}
