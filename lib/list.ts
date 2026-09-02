import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";
import {
  MIN_POSITION_GAP,
  OrderConflictError,
  PlacementIntent,
  PositionSpaceExhaustedError,
  lockBoardRowForUpdate,
  lockListRowsForUpdate,
  lockWorkspaceRowForUpdate,
  renumberPositions,
} from "@/lib/ordering";

const LIST_POSITION_GAP = 16384;
const MAX_CREATE_LIST_RETRIES = 5;

function isUniqueConstraintError(error: unknown): error is { code: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const withCode = error as { code?: unknown };
  return withCode.code === "P2002";
}

export type ListRecord = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  /** Logical ordering-move revision; sibling normalization does not bump it. */
  moveRevision: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const LIST_RECORD_SELECT = {
  id: true,
  boardId: true,
  title: true,
  position: true,
  moveRevision: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CardLabelRecord = {
  id: string;
  name: string;
  color: string;
};

export type CardFaceMember = {
  id: string;
  name: string;
  image: string | null;
};

export type ListCardRecord = {
  id: string;
  listId: string;
  title: string;
  position: number;
  /** Logical ordering-move revision; sibling normalization does not bump it. */
  moveRevision: number;
  coverImage: string | null;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date | null;
  completedAt: Date | null;
  /** Last-modified timestamp — drives the board filter's "activity" dimension (US-065). */
  updatedAt: Date;
  labels: CardLabelRecord[];
  /** The full assignee set. The card face slices to a small avatar cap at render;
   *  the board filter (US-065) needs the complete set to match and to build the
   *  member option list. Assignee counts are small, so the payload stays bounded. */
  members: CardFaceMember[];
  /** Total assignees (== members.length now that members is uncapped); drives the "+N" overflow. */
  memberCount: number;
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
};

export type ListWithCardsRecord = ListRecord & {
  cards: ListCardRecord[];
};

export async function getListsByBoardId(
  boardId: string,
): Promise<ListWithCardsRecord[]> {
  const lists = await db.list.findMany({
    where: { boardId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      moveRevision: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      cards: {
        // "live" = matches the card_listId_position_live_key index predicate
        // (archived AND soft-deleted both excluded), so the board never renders
        // — nor lets a user drag relative to — a card the position index ignores.
        where: {
          archivedAt: null,
          deletedAt: null,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          listId: true,
          title: true,
          position: true,
          moveRevision: true,
          coverImage: true,
          priority: true,
          dueDate: true,
          completedAt: true,
          updatedAt: true,
          labels: {
            select: {
              label: { select: { id: true, name: true, color: true } },
            },
          },
          // Uncapped: the board filter (US-065) matches on the full assignee set
          // and derives its member options from it. The card face slices to a
          // small avatar cap at render. Assignee counts per card are small.
          members: {
            orderBy: { assignedAt: "asc" },
            select: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
          // Item booleans only, aggregated to done/total below — the card face
          // sends two numbers, never the raw items, to keep the payload small.
          checklists: {
            select: { items: { select: { isCompleted: true } } },
          },
          _count: { select: { members: true, comments: true } },
        },
      },
    },
  });

  return lists.map((list) => ({
    ...list,
    cards: list.cards.map((card) => {
      let checklistTotal = 0;
      let checklistDone = 0;
      for (const checklist of card.checklists) {
        for (const item of checklist.items) {
          checklistTotal += 1;
          if (item.isCompleted) {
            checklistDone += 1;
          }
        }
      }

      return {
        id: card.id,
        listId: card.listId,
        title: card.title,
        position: card.position,
        moveRevision: card.moveRevision,
        coverImage: card.coverImage,
        priority: card.priority,
        dueDate: card.dueDate,
        completedAt: card.completedAt,
        updatedAt: card.updatedAt,
        labels: card.labels.map((cardLabel) => cardLabel.label),
        members: card.members.map((member) => member.user),
        memberCount: card._count.members,
        checklistDone,
        checklistTotal,
        commentCount: card._count.comments,
      };
    }),
  }));
}

export async function createList(data: {
  boardId: string;
  title: string;
  workspaceId: string;
}): Promise<ListRecord> {
  for (let attempt = 0; attempt < MAX_CREATE_LIST_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        // Global ordering gate, then parent-to-child board lock. The workspace
        // row is re-entrant inside a recursive automation transaction and
        // prevents cross-board cascades from forming a lock cycle.
        await lockWorkspaceRowForUpdate(tx, data.workspaceId);
        const board = await lockBoardRowForUpdate(tx, data.boardId);
        if (!board) {
          throw new Error("BOARD_NOT_FOUND");
        }

        const lastList = await tx.list.findFirst({
          where: { boardId: data.boardId, archivedAt: null },
          orderBy: { position: "desc" },
          select: { position: true },
        });

        const position = lastList ? lastList.position + LIST_POSITION_GAP : LIST_POSITION_GAP;

        return await tx.list.create({
          data: {
            boardId: data.boardId,
            title: data.title,
            position,
          },
          select: LIST_RECORD_SELECT,
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
        throw error;
      }

      // Unique-index canary only: under the board lock a P2002 means a real bug;
      // retry bounds the damage rather than recovering from legit contention.
      if (isUniqueConstraintError(error) && attempt < MAX_CREATE_LIST_RETRIES - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to create list after retrying position conflicts");
}

export async function updateListTitle(listId: string, title: string): Promise<ListRecord> {
  return db.list.update({
    where: { id: listId, archivedAt: null },
    data: { title },
    select: LIST_RECORD_SELECT,
  });
}

async function normalizeListPositions(tx: Prisma.TransactionClient, boardId: string): Promise<void> {
  // Collision-safe under the live `list_boardId_position_live_key` unique index: an
  // in-place renumber can transiently assign a position another list still
  // holds and abort mid-transaction, so renumber via a disjoint staging band.
  // This maintenance rewrite preserves sibling order and changes no revisions.
  const lists = await tx.list.findMany({
    where: { boardId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true },
  });

  await renumberPositions(lists, LIST_POSITION_GAP, (id, position) =>
    tx.list.update({ where: { id }, data: { position } }),
  );
}

/** Midpoint of two list positions, or throw if too close to split cleanly. */
function bisectListPosition(a: number, b: number): number {
  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  if (upper - lower < MIN_POSITION_GAP) {
    throw new PositionSpaceExhaustedError();
  }
  return (lower + upper) / 2;
}

/**
 * Compute the position for a list placed on `boardId` according to an EXPLICIT
 * {@link PlacementIntent} (decision 0032) — the list analogue of
 * {@link resolveCardPositionIntent}. Runs on the caller's transaction client,
 * which MUST already hold the board `FOR UPDATE` scope lock.
 *
 * - `start` / `end` are absolute (relative to the current live ends; never
 *   conflict).
 * - `between` validates both anchors against current live lists; preserves the
 *   prev anchor when it remains before next, rebases on one surviving anchor,
 *   and throws {@link OrderConflictError}("ANCHORS_STALE") when both are stale
 *   or contradictory.
 */
export async function resolveListPositionIntent(
  client: Prisma.TransactionClient,
  data: {
    boardId: string;
    intent: PlacementIntent;
    prevListId?: string | null;
    nextListId?: string | null;
    excludeListId?: string | null;
  },
): Promise<number> {
  const { boardId, intent, excludeListId } = data;
  const prevListId = data.prevListId ?? null;
  const nextListId = data.nextListId ?? null;
  const notMoved = excludeListId ? { id: { not: excludeListId } } : {};
  const activeScope = { boardId, archivedAt: null, ...notMoved };

  if (intent === "start") {
    const first = await client.list.findFirst({
      where: activeScope,
      orderBy: { position: "asc" },
      select: { position: true },
    });
    return first ? first.position - LIST_POSITION_GAP : LIST_POSITION_GAP;
  }

  if (intent === "end") {
    const last = await client.list.findFirst({
      where: activeScope,
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return last ? last.position + LIST_POSITION_GAP : LIST_POSITION_GAP;
  }

  let prev: { position: number } | null = null;
  let next: { position: number } | null = null;
  if (prevListId) {
    const p = await client.list.findUnique({
      where: { id: prevListId },
      select: { id: true, boardId: true, position: true, archivedAt: true },
    });
    if (p && p.boardId === boardId && !Boolean(p.archivedAt)) {
      prev = p;
    }
  }
  if (nextListId) {
    const n = await client.list.findUnique({
      where: { id: nextListId },
      select: { id: true, boardId: true, position: true, archivedAt: true },
    });
    if (n && n.boardId === boardId && !Boolean(n.archivedAt)) {
      next = n;
    }
  }

  if (!prev && !next) {
    throw new OrderConflictError("ANCHORS_STALE");
  }

  if (prev && next && prev.position >= next.position) {
    throw new OrderConflictError("ANCHORS_STALE");
  }

  if (prev) {
    const following = await client.list.findFirst({
      where: { ...activeScope, position: { gt: prev.position } },
      orderBy: { position: "asc" },
      select: { position: true },
    });

    if (!following) {
      return prev.position + LIST_POSITION_GAP;
    }
    return bisectListPosition(prev.position, following.position);
  }

  const nextList = next as { position: number };
  const preceding = await client.list.findFirst({
    where: { ...activeScope, position: { lt: nextList.position } },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  if (!preceding) {
    return nextList.position - LIST_POSITION_GAP;
  }
  return bisectListPosition(preceding.position, nextList.position);
}

export async function reorderListByNeighbors(data: {
  listId: string;
  workspaceId: string;
  intent: PlacementIntent;
  prevListId?: string | null;
  nextListId?: string | null;
  expectedMoveRevision: number;
}): Promise<ListRecord> {
  return await db.$transaction(async (tx) => {
    // Non-lock pre-read: identifies the board scope the moved list lives on.
    const currentList = await tx.list.findUnique({
      where: { id: data.listId },
      select: { id: true, boardId: true, position: true, moveRevision: true, archivedAt: true },
    });

    if (!currentList || Boolean(currentList.archivedAt)) {
      throw new Error("List not found");
    }

    // Global workspace gate, then parent-to-child board → list locks. The
    // workspace gate is essential for recursive automation that may target a
    // different board in the same transaction.
    await lockWorkspaceRowForUpdate(tx, data.workspaceId);
    const board = await lockBoardRowForUpdate(tx, currentList.boardId);
    if (!board) {
      throw new Error("List not found");
    }
    const locked = await lockListRowsForUpdate(tx, [data.listId]);
    if (locked.length === 0) {
      throw new Error("List not found");
    }

    const list = locked[0];
    if (list.moveRevision !== data.expectedMoveRevision) {
      throw new OrderConflictError("MOVE_REVISION");
    }

    let nextPosition: number;
    try {
      nextPosition = await resolveListPositionIntent(tx, {
        boardId: currentList.boardId,
        intent: data.intent,
        prevListId: data.prevListId ?? null,
        nextListId: data.nextListId ?? null,
        excludeListId: data.listId,
      });
    } catch (error) {
      // Gap exhausted: renumber IN THE SAME transaction (board lock still held),
      // then re-resolve against the fresh layout — no separate-transaction retry.
      if (error instanceof PositionSpaceExhaustedError) {
        await normalizeListPositions(tx, currentList.boardId);
        nextPosition = await resolveListPositionIntent(tx, {
          boardId: currentList.boardId,
          intent: data.intent,
          prevListId: data.prevListId ?? null,
          nextListId: data.nextListId ?? null,
          excludeListId: data.listId,
        });
      } else {
        throw error;
      }
    }

    // Compare-and-set on the revision read under the lock: bump it atomically.
    const { count } = await tx.list.updateMany({
      where: { id: data.listId, moveRevision: list.moveRevision },
      data: { position: nextPosition, moveRevision: list.moveRevision + 1 },
    });
    if (count === 0) {
      throw new OrderConflictError("MOVE_REVISION");
    }

    return await tx.list.findUniqueOrThrow({
      where: { id: data.listId },
      select: LIST_RECORD_SELECT,
    });
  });
}

export async function archiveList(listId: string): Promise<ListRecord> {
  return db.list.update({
    where: { id: listId },
    data: { archivedAt: new Date() },
    select: LIST_RECORD_SELECT,
  });
}

/** Legacy alias for archiveList (US-074 Slice A) */
export async function deleteList(listId: string): Promise<void> {
  await archiveList(listId);
}

export async function getListWithBoard(listId: string): Promise<{
  list: ListRecord;
  board: { id: string; workspaceId: string; archivedAt: Date | null };
} | null> {
  const list = await db.list.findUnique({
    where: { id: listId, archivedAt: null },
    select: {
      ...LIST_RECORD_SELECT,
      board: {
        select: {
          id: true,
          workspaceId: true,
          archivedAt: true,
        },
      },
    },
  });

  if (!list) {
    return null;
  }

  const { board, ...listData } = list;
  return { list: listData, board };
}

export type ArchivedListRecord = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  archivedAt: Date;
  cardCount: number;
};

export async function getArchivedLists(
  boardId: string,
): Promise<ArchivedListRecord[]> {
  const lists = await db.list.findMany({
    where: {
      boardId,
      archivedAt: { not: null },
      board: { archivedAt: null },
    },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      archivedAt: true,
      _count: {
        select: {
          cards: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });

  return lists.map((list) => ({
    id: list.id,
    boardId: list.boardId,
    title: list.title,
    position: list.position,
    archivedAt: list.archivedAt as Date,
    cardCount: list._count.cards,
  }));
}

export async function getArchivedListWithBoard(listId: string): Promise<{
  list: ListRecord;
  board: { id: string; workspaceId: string; archivedAt: Date | null };
} | null> {
  const list = await db.list.findFirst({
    where: {
      id: listId,
      archivedAt: { not: null },
      board: { archivedAt: null },
    },
    select: {
      ...LIST_RECORD_SELECT,
      board: {
        select: {
          id: true,
          workspaceId: true,
          archivedAt: true,
        },
      },
    },
  });

  if (!list) {
    return null;
  }

  const { board, ...listData } = list;
  return { list: listData, board };
}

export async function restoreList(listId: string, workspaceId: string): Promise<ListRecord> {
  return await db.$transaction(async (tx) => {
    // Non-lock pre-read: which board does the archived list belong to?
    const targetList = await tx.list.findFirst({
      where: {
        id: listId,
        archivedAt: { not: null },
        board: { archivedAt: null },
      },
      select: { id: true, boardId: true, position: true },
    });

    if (!targetList) {
      throw new Error("LIST_NOT_FOUND");
    }

    // Global workspace gate, then board and archived-list locks (the list
    // re-enters ordering space on restore).
    await lockWorkspaceRowForUpdate(tx, workspaceId);
    const board = await lockBoardRowForUpdate(tx, targetList.boardId);
    if (!board) {
      throw new Error("LIST_NOT_FOUND");
    }
    const locked = await tx.$queryRaw<
      Array<{ id: string; boardId: string; position: number }>
    >`SELECT id, "boardId", position FROM "list" WHERE id = ${listId} AND "archivedAt" IS NOT NULL FOR UPDATE`;
    if (locked.length === 0) {
      // Restored (or purged) concurrently since the pre-read.
      throw new Error("LIST_NOT_FOUND");
    }

    // Keep the original position when it is still free; otherwise append after
    // the last active list (US-074 semantics, now race-free under the lock).
    const occupied = await tx.list.findFirst({
      where: {
        boardId: targetList.boardId,
        archivedAt: null,
        position: targetList.position,
      },
      select: { id: true },
    });

    let newPosition = targetList.position;
    if (occupied) {
      const lastActive = await tx.list.findFirst({
        where: { boardId: targetList.boardId, archivedAt: null },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      newPosition = lastActive ? lastActive.position + LIST_POSITION_GAP : LIST_POSITION_GAP;
    }

    const updateResult = await tx.list.updateMany({
      where: {
        id: listId,
        archivedAt: { not: null },
      },
      data: {
        archivedAt: null,
        position: newPosition,
        moveRevision: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new Error("LIST_NOT_FOUND");
    }

    return tx.list.findUniqueOrThrow({
      where: { id: listId },
      select: LIST_RECORD_SELECT,
    });
  });
}
