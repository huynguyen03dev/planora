import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";

import {
  CARD_POSITION_GAP,
  LIVE_CARD_SCOPE,
  OrderConflictError,
  PlacementIntent,
  PositionSpaceExhaustedError,
  lockBoardRowsForUpdate,
  lockCardRowForUpdate,
  lockListRowsForUpdate,
  lockWorkspaceRowForUpdate,
  normalizeCardPositions,
  resolveCardPositionIntent,
} from "@/lib/ordering";

export type CardRecord = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
  /** Logical user/automation ordering-move revision; normalization does not bump it. */
  moveRevision: number;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date | null;
  estimateHours: number | null;
  completedAt: Date | null;
  deletedAt: Date | null;
  coverImage: string | null;
  archivedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

const CARD_RECORD_SELECT = {
  id: true,
  listId: true,
  title: true,
  description: true,
  position: true,
  moveRevision: true,
  priority: true,
  dueDate: true,
  estimateHours: true,
  completedAt: true,
  deletedAt: true,
  coverImage: true,
  archivedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CardMoveTransactionResult = {
  card: CardRecord;
  fromListId: string;
  fromBoardId: string;
  targetBoardId: string;
};

export type CardOrderingScope = {
  boardId: string;
  listId: string;
};

export type CardDetailRecord = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  estimateHours: number | null;
  dueDate: Date | null;
  completedAt: Date | null;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  coverImage: string | null;
  updatedAt: Date;
};

const CARD_DETAIL_SELECT = {
  id: true,
  listId: true,
  title: true,
  description: true,
  estimateHours: true,
  dueDate: true,
  completedAt: true,
  priority: true,
  coverImage: true,
  updatedAt: true,
} as const;

export type CardWithListBoardRecord = {
  card: CardRecord;
  list: {
    id: string;
    boardId: string;
  };
  board: {
    id: string;
    workspaceId: string;
    archivedAt: Date | null;
  };
};

/**
 * W8 shape of `getArchivedCardWithListAndBoard`: the existing record plus the
 * parent-list discriminator. `parentListArchived: true` means the card exists
 * and remains archived but its parent list is archived — restoring it would
 * create a live card inside an invisible list. The resolver deliberately does
 * NOT hide this case behind null: the action needs the workspace/board scope
 * to run the permission gate BEFORE surfacing the dedicated message, so the
 * discrimination can never leak existence to unauthorized callers.
 */
export type ArchivedCardWithListBoardResult = CardWithListBoardRecord & {
  parentListArchived: boolean;
};

export async function createCard(data: {
  listId: string;
  title: string;
  createdById: string;
  workspaceId: string;
}): Promise<CardRecord> {
  return await db.$transaction(async (tx) => {
    const parentList = await tx.list.findUnique({
      where: { id: data.listId },
      select: {
        boardId: true,
        archivedAt: true,
        board: { select: { workspaceId: true, archivedAt: true } },
      },
    });
    if (
      !parentList ||
      parentList.archivedAt !== null ||
      parentList.board.archivedAt !== null ||
      parentList.board.workspaceId !== data.workspaceId
    ) {
      throw new Error("LIST_NOT_FOUND");
    }

    // Global workspace gate, then parent-to-child board → list locks. This is
    // re-entrant for recursive automation and prevents a cascade-wide lock
    // inversion.
    await lockWorkspaceRowForUpdate(tx, data.workspaceId);
    const board = await lockBoardRowsForUpdate(tx, [parentList.boardId]);
    if (board.length === 0) {
      throw new Error("LIST_NOT_FOUND");
    }
    const locked = await lockListRowsForUpdate(tx, [data.listId]);
    if (locked.length === 0) {
      throw new Error("LIST_NOT_FOUND");
    }

    const lastCard = await tx.card.findFirst({
      where: {
        listId: data.listId,
        ...LIVE_CARD_SCOPE,
      },
      orderBy: [{ position: "desc" }, { createdAt: "desc" }],
      select: { position: true },
    });

    const position = lastCard ? lastCard.position + CARD_POSITION_GAP : CARD_POSITION_GAP;

    return tx.card.create({
      data: {
        listId: data.listId,
        title: data.title,
        createdById: data.createdById,
        position,
      },
      select: CARD_RECORD_SELECT,
    });
  });
}

/**
 * Acquire the parent ordering scope before a card mutation that may evaluate
 * automation. The initial card lookup is deliberately after the workspace
 * gate: completion can race a move, and the current parent must be selected
 * under the same workspace serialization used by moveCardInTransaction.
 *
 * Lock order is workspace → board → list → card. Keeping this helper separate
 * from setCardCompletion preserves that helper's reusable compare-and-set
 * business semantics while making every production completion path safe for a
 * recursive move-capable automation cascade.
 */
export async function lockCardOrderingScopeForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  cardId: string,
): Promise<CardOrderingScope> {
  await lockWorkspaceRowForUpdate(tx, workspaceId);

  const located = await tx.card.findUnique({
    where: { id: cardId, ...LIVE_CARD_SCOPE },
    select: {
      id: true,
      listId: true,
      list: {
        select: {
          id: true,
          boardId: true,
          archivedAt: true,
          board: { select: { workspaceId: true, archivedAt: true } },
        },
      },
    },
  });

  if (
    !located ||
    located.list.archivedAt !== null ||
    located.list.board.archivedAt !== null ||
    located.list.board.workspaceId !== workspaceId
  ) {
    throw new Error("Card not found");
  }

  const boards = await lockBoardRowsForUpdate(tx, [located.list.boardId]);
  if (boards.length !== 1) {
    throw new Error("Card not found");
  }

  const lists = await lockListRowsForUpdate(tx, [located.listId]);
  if (lists.length !== 1) {
    throw new Error("Card not found");
  }

  const lockedCard = await lockCardRowForUpdate(tx, cardId);
  if (!lockedCard || lockedCard.listId !== located.listId) {
    throw new Error("Card not found");
  }

  return {
    boardId: located.list.boardId,
    listId: located.listId,
  };
}

/**
 * Move one live card inside an existing transaction.
 *
 * This is the single ordering protocol used by human DnD and automation:
 * workspace gate → sorted boards → sorted live lists → moved card → resolve →
 * normalize-if-needed → revision CAS. The workspace row lock is deliberately
 * broader than one board because recursive rules can target any board in their
 * workspace; re-acquiring it in the same transaction is safe and prevents two
 * recursive cascades from deadlocking while discovering new targets.
 *
 * `expectedMoveRevision` is supplied by human DnD. Automation omits it and
 * atomically bumps the revision observed under the card lock. Normalization only
 * rewrites sibling positions; it never bumps or emits sibling revisions.
 */
export async function moveCardInTransaction(
  tx: Prisma.TransactionClient,
  data: {
    workspaceId: string;
    cardId: string;
    targetListId?: string;
    intent: PlacementIntent;
    prevCardId?: string | null;
    nextCardId?: string | null;
    expectedMoveRevision?: number;
  },
): Promise<CardMoveTransactionResult> {
  // Non-locking reads identify every parent scope. No row lock is held until
  // the workspace gate below, so these reads cannot participate in a cycle.
  const source = await tx.card.findUnique({
    where: { id: data.cardId, ...LIVE_CARD_SCOPE },
    select: {
      id: true,
      listId: true,
      moveRevision: true,
      list: {
        select: {
          id: true,
          boardId: true,
          archivedAt: true,
          board: { select: { id: true, workspaceId: true, archivedAt: true } },
        },
      },
    },
  });

  if (
    !source ||
    source.list.archivedAt !== null ||
    source.list.board.archivedAt !== null ||
    source.list.board.workspaceId !== data.workspaceId
  ) {
    throw new Error("Card not found");
  }

  const targetListId = data.targetListId ?? source.listId;
  const target = await tx.list.findUnique({
    where: { id: targetListId },
    select: {
      id: true,
      boardId: true,
      archivedAt: true,
      board: { select: { id: true, workspaceId: true, archivedAt: true } },
    },
  });

  if (
    !target ||
    target.archivedAt !== null ||
    target.board.archivedAt !== null ||
    target.board.workspaceId !== data.workspaceId
  ) {
    throw new OrderConflictError("SCOPE_STALE");
  }

  await lockWorkspaceRowForUpdate(tx, data.workspaceId);

  const boardIds = [source.list.boardId, target.boardId];
  const lockedBoards = await lockBoardRowsForUpdate(tx, boardIds);
  if (lockedBoards.length !== new Set(boardIds).size) {
    throw new OrderConflictError("SCOPE_STALE");
  }

  const listIds = [source.listId, targetListId];
  const lockedLists = await lockListRowsForUpdate(tx, listIds);
  if (lockedLists.length !== new Set(listIds).size) {
    throw new OrderConflictError("SCOPE_STALE");
  }

  const card = await lockCardRowForUpdate(tx, data.cardId);
  if (!card) {
    throw new Error("Card not found");
  }
  if (card.listId !== source.listId) {
    throw new OrderConflictError("MOVE_REVISION");
  }
  if (
    data.expectedMoveRevision !== undefined &&
    card.moveRevision !== data.expectedMoveRevision
  ) {
    throw new OrderConflictError("MOVE_REVISION");
  }

  let nextPosition: number;
  try {
    nextPosition = await resolveCardPositionIntent(tx, {
      targetListId,
      intent: data.intent,
      prevCardId: data.prevCardId ?? null,
      nextCardId: data.nextCardId ?? null,
      excludeCardId: data.cardId,
    });
  } catch (error) {
    if (!(error instanceof PositionSpaceExhaustedError)) {
      throw error;
    }

    await normalizeCardPositions(tx, targetListId);
    nextPosition = await resolveCardPositionIntent(tx, {
      targetListId,
      intent: data.intent,
      prevCardId: data.prevCardId ?? null,
      nextCardId: data.nextCardId ?? null,
      excludeCardId: data.cardId,
    });
  }

  const updateResult = await tx.card.updateMany({
    where: {
      id: data.cardId,
      ...LIVE_CARD_SCOPE,
      moveRevision: card.moveRevision,
    },
    data: {
      listId: targetListId,
      position: nextPosition,
      moveRevision: card.moveRevision + 1,
    },
  });

  if (updateResult.count === 0) {
    throw new OrderConflictError("MOVE_REVISION");
  }

  const updatedCard = await tx.card.findUniqueOrThrow({
    where: { id: data.cardId },
    select: CARD_RECORD_SELECT,
  });

  return {
    card: updatedCard,
    fromListId: source.listId,
    fromBoardId: source.list.boardId,
    targetBoardId: target.boardId,
  };
}

export async function archiveCard(cardId: string): Promise<void> {
  await db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      archivedAt: new Date(),
    },
  });
}

export async function reorderCardWithinListByNeighbors(data: {
  cardId: string;
  workspaceId: string;
  intent: PlacementIntent;
  prevCardId?: string | null;
  nextCardId?: string | null;
  expectedMoveRevision: number;
}): Promise<CardRecord> {
  return await db.$transaction(async (tx) => {
    const result = await moveCardInTransaction(tx, data);
    return result.card;
  });
}

export async function getCardWithListAndBoard(
  cardId: string,
): Promise<CardWithListBoardRecord | null> {
  const card = await db.card.findUnique({
    where: {
      id: cardId,
      archivedAt: null,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      moveRevision: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      list: {
        select: {
          id: true,
          boardId: true,
          archivedAt: true,
          board: {
            select: {
              id: true,
              workspaceId: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  // US-074 Slice B2: reject if the parent list is archived, making the card
  // immutable through all ordinary card/checklist/comment/member/label/attachment
  // actions. Only archive-aware flows (getArchivedCardWithListAndBoard,
  // getArchivedCards) resolve cards under archived lists.
  if (card.list.archivedAt !== null) {
    return null;
  }

  const { list, ...cardData } = card;
  return {
    card: cardData,
    list: {
      id: list.id,
      boardId: list.boardId,
    },
    board: list.board,
  };
}

export async function getCardDetailForBoard(
  boardId: string,
  cardId: string,
): Promise<CardDetailRecord | null> {
  const card = await db.card.findUnique({
    where: {
      id: cardId,
      archivedAt: null,
    },
    select: {
      ...CARD_DETAIL_SELECT,
      list: {
        select: {
          boardId: true,
        },
      },
    },
  });

  if (!card || card.list.boardId !== boardId) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { list: _list, ...cardData } = card;
  return cardData;
}

export async function updateCardDetails(
  cardId: string,
  data: { title: string; description: string | null },
): Promise<CardDetailRecord> {
  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      title: data.title,
      description: data.description,
    },
    select: CARD_DETAIL_SELECT,
  });
}

// ─── Analytics-related card operations ─────────────────────────────

export async function updateCardEstimate(
  cardId: string,
  estimateHours: number | null,
): Promise<CardRecord> {
  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      estimateHours,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      moveRevision: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateCardDueDate(
  cardId: string,
  dueDate: Date | null,
): Promise<CardRecord> {
  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      dueDate,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      moveRevision: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Resolve the next `completedAt` for a completion toggle (US-045). Pure: complete
 * writes a fresh timestamp, reopen clears it. A re-complete of an already-complete
 * card preserves the existing timestamp so the current-streak anchor (US-064) is
 * stable; a complete after a reopen sets a new timestamp (the reopen already
 * cleared it). `now` is injected so the transition is deterministic under test.
 */
export function resolveCompletedAt(
  complete: boolean,
  existingCompletedAt: Date | null,
  now: Date,
): Date | null {
  return complete ? (existingCompletedAt ?? now) : null;
}

/**
 * Set a card's completion state (US-045). Completion is card-owned and freely
 * toggleable; dragging never calls this — list membership no longer derives
 * completion (decision 0020). Accepts a transaction client so the caller can
 * write the completion and its `CARD_COMPLETED`/`CARD_REOPENED` history event
 * atomically. Returns the updated card row.
 */
export async function setCardCompletion(
  client: Prisma.TransactionClient | typeof db,
  cardId: string,
  complete: boolean,
  existingCompletedAt: Date | null,
  now: Date = new Date(),
): Promise<{ card: CardRecord; transitioned: boolean }> {
  const completedAt = resolveCompletedAt(complete, existingCompletedAt, now);

  // Compare-and-set: flip only a card still in its pre-toggle state. Under two
  // concurrent toggles the loser's WHERE matches zero rows, so exactly one caller
  // sees `transitioned: true` — the CARD_COMPLETED / CARD_REOPENED history event
  // is never double-written for one streak (decision 0021). A re-complete of an
  // already-complete card likewise matches zero rows, preserving the original
  // timestamp (the US-064 streak anchor) with no redundant write.
  const { count } = await client.card.updateMany({
    where: {
      id: cardId,
      archivedAt: null,
      completedAt: complete ? null : { not: null },
    },
    data: {
      completedAt,
    },
  });

  const card = await client.card.findUniqueOrThrow({
    where: { id: cardId },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      moveRevision: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { card, transitioned: count === 1 };
}

/**
 * Get card with list and members for history snapshot.
 * Used to capture metadata for analytics events.
 */
export async function getCardWithListAndMembers(cardId: string): Promise<{
  card: CardRecord;
  list: { id: string; boardId: string };
  board: { id: string; workspaceId: string };
  memberIds: string[];
} | null> {
  const card = await db.card.findUnique({
    where: {
      id: cardId,
      archivedAt: null,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      moveRevision: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      list: {
        select: {
          id: true,
          boardId: true,
          archivedAt: true,
          board: {
            select: {
              id: true,
              workspaceId: true,
            },
          },
        },
      },
      members: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  // US-074 Slice B2: reject if the parent list is archived.
  if (card.list.archivedAt !== null) {
    return null;
  }

  const { list, members, ...cardData } = card;
  return {
    card: cardData,
    list: {
      id: list.id,
      boardId: list.boardId,
    },
    board: list.board,
    memberIds: members.map((m) => m.userId),
  };
}

/**
 * A board's archived card, summarized for the Archived-cards view.
 */
export type ArchivedCardRecord = {
  id: string;
  title: string;
  listId: string;
  listTitle: string;
  archivedAt: Date;
};

/**
 * List a board's archived cards (newest first) for the Archived-cards view.
 * Scoped through the owning list/board; the board itself must not be archived.
 */
export async function getArchivedCards(
  boardId: string,
): Promise<ArchivedCardRecord[]> {
  const cards = await db.card.findMany({
    where: {
      archivedAt: { not: null },
      list: {
        boardId,
        archivedAt: null,
        board: { archivedAt: null },
      },
    },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      title: true,
      listId: true,
      archivedAt: true,
      list: {
        select: { title: true },
      },
    },
  });

  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    listId: card.listId,
    listTitle: card.list.title,
    // archivedAt is non-null by the `where` filter above.
    archivedAt: card.archivedAt as Date,
  }));
}

/**
 * Resolve an *archived* card with its list + board scope envelope. Mirrors
 * `getCardWithListAndBoard` but requires `archivedAt: { not: null }` — the
 * archivedAt:null filter there means it could never find a card to restore.
 * Returns null for a non-archived, missing, or foreign card id.
 */
export async function getArchivedCardWithListAndBoard(
  cardId: string,
): Promise<ArchivedCardWithListBoardResult | null> {
  const card = await db.card.findFirst({
    where: {
      id: cardId,
      archivedAt: { not: null },
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      moveRevision: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      list: {
        select: {
          id: true,
          boardId: true,
          archivedAt: true,
          board: {
            select: {
              id: true,
              workspaceId: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  // US-074 Slice B2 + US-083 W8: a card can only be restored if its parent
  // list is active. Instead of collapsing the archived-parent case to null
  // (which would lose the workspace/board scope needed to gate the dedicated
  // "restore the list first" outcome), flag it: restoreCardAction checks the
  // permission first, then discriminates. The in-transaction FOR UPDATE
  // revalidation (restoreCardAction) re-checks the same condition against the
  // true race where the list is archived between this read and the commit.
  const { list, ...cardData } = card;
  return {
    card: cardData,
    list: {
      id: list.id,
      boardId: list.boardId,
    },
    board: list.board,
    parentListArchived: card.list.archivedAt !== null,
  };
}


export async function updateCardCover(
  cardId: string,
  coverImage: string | null,
  client?: Prisma.TransactionClient,
): Promise<CardDetailRecord> {
  const c = client ?? db;
  return c.card.update({
    where: { id: cardId, archivedAt: null },
    data: { coverImage },
    select: CARD_DETAIL_SELECT,
  });
}

export async function updateCardPriority(
  cardId: string,
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<CardDetailRecord> {
  return client.card.update({
    where: { id: cardId, archivedAt: null },
    data: { priority },
    select: CARD_DETAIL_SELECT,
  });
}
