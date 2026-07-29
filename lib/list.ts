import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";
import {
  MIN_POSITION_GAP,
  PositionSpaceExhaustedError,
  StaleNeighborError,
  renumberPositions,
} from "@/lib/ordering";

const LIST_POSITION_GAP = 16384;
const MAX_CREATE_LIST_RETRIES = 5;
const MAX_REORDER_LIST_RETRIES = 3;

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
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

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
}): Promise<ListRecord> {
  for (let attempt = 0; attempt < MAX_CREATE_LIST_RETRIES; attempt += 1) {
    const lastList = await db.list.findFirst({
      where: { boardId: data.boardId, archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const position = lastList ? lastList.position + LIST_POSITION_GAP : LIST_POSITION_GAP;

    try {
      return await db.list.create({
        data: {
          boardId: data.boardId,
          title: data.title,
          position,
        },
        select: {
          id: true,
          boardId: true,
          title: true,
          position: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
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
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function normalizeListPositions(boardId: string): Promise<void> {
  // Collision-safe under the live `list_boardId_position_live_key` unique index: an
  // in-place renumber can transiently assign a position another list still
  // holds and abort mid-transaction, so renumber via a disjoint staging band.
  await db.$transaction(async (tx) => {
    const lists = await tx.list.findMany({
      where: { boardId, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });

    await renumberPositions(lists, LIST_POSITION_GAP, (id, position) =>
      tx.list.update({ where: { id }, data: { position } }),
    );
  });
}

type PositionContext = {
  boardId: string;
  prevListId?: string | null;
  nextListId?: string | null;
  excludeListId?: string | null;
};

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
 * Compute the position for a list dropped between `prevListId` and `nextListId`
 * on `boardId`, collision-safe under concurrency — the list analogue of
 * {@link resolveCardPosition} (US-062 MJ3).
 *
 * The client's prev/next hints describe the *intended* neighbours, but a rival
 * reorder committing between read and write can make them stale, so we never
 * trust `prev.position ± GAP` blindly. We anchor on the surviving hint and
 * bisect against the list that CURRENTLY occupies the adjacent slot:
 *
 * - prev given → bisect between prev and the live list immediately after prev
 *   (or `prev + GAP` if prev is genuinely last). Fixes the concurrent end-drop
 *   that the old direct-bisect looped on.
 * - only next given → symmetric, bisecting before `next`.
 * - neither → append after the last live list.
 *
 * `excludeListId` omits the list being moved from the adjacency search so a
 * reorder never bisects against the mover's own stale slot. Throws
 * {@link StaleNeighborError} when a hint no longer names a live list on the
 * board, and {@link PositionSpaceExhaustedError} when there is no room to bisect.
 */
export async function resolveListPosition(
  client: Prisma.TransactionClient,
  { boardId, prevListId, nextListId, excludeListId }: PositionContext,
): Promise<number> {
  const prevList = prevListId
    ? await client.list.findUnique({
        where: { id: prevListId },
        select: { id: true, boardId: true, position: true, archivedAt: true },
      })
    : null;
  const nextList = nextListId
    ? await client.list.findUnique({
        where: { id: nextListId },
        select: { id: true, boardId: true, position: true, archivedAt: true },
      })
    : null;

  if (prevListId && (!prevList || prevList.boardId !== boardId || Boolean(prevList.archivedAt))) {
    throw new StaleNeighborError("prev");
  }

  if (nextListId && (!nextList || nextList.boardId !== boardId || Boolean(nextList.archivedAt))) {
    throw new StaleNeighborError("next");
  }

  const notMoved = excludeListId ? { id: { not: excludeListId } } : {};
  const activeScope = { boardId, archivedAt: null, ...notMoved };

  if (prevList) {
    const following = await client.list.findFirst({
      where: {
        ...activeScope,
        position: { gt: prevList.position },
      },
      orderBy: { position: "asc" },
      select: { position: true },
    });

    if (!following) {
      return prevList.position + LIST_POSITION_GAP;
    }
    return bisectListPosition(prevList.position, following.position);
  }

  if (nextList) {
    const preceding = await client.list.findFirst({
      where: {
        ...activeScope,
        position: { lt: nextList.position },
      },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    if (!preceding) {
      return nextList.position - LIST_POSITION_GAP;
    }
    return bisectListPosition(preceding.position, nextList.position);
  }

  const lastList = await client.list.findFirst({
    where: activeScope,
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return lastList ? lastList.position + LIST_POSITION_GAP : LIST_POSITION_GAP;
}

export async function reorderListByNeighbors(data: {
  listId: string;
  prevListId?: string | null;
  nextListId?: string | null;
}): Promise<ListRecord> {
  // Hints are mutable across retries: a StaleNeighborError drops the offending
  // side so the next attempt re-anchors on the surviving neighbour (or appends),
  // parity with the card reorder path (US-062 mn2).
  let prevHint = data.prevListId ?? null;
  let nextHint = data.nextListId ?? null;

  for (let attempt = 0; attempt < MAX_REORDER_LIST_RETRIES; attempt += 1) {
    // boardId of the list being moved, captured inside the tx so a too-tight gap
    // can renumber the right board before the next attempt.
    let boardIdForRetry: string | null = null;

    try {
      // Read-check-write in one transaction (ARCHITECTURE: "transaction for
      // multi-row position writes") so the position decision and the update see
      // a consistent snapshot, matching the card reorder path.
      return await db.$transaction(async (tx) => {
        const currentList = await tx.list.findUnique({
          where: { id: data.listId },
          select: {
            id: true,
            boardId: true,
            position: true,
            archivedAt: true,
          },
        });

        if (!currentList || Boolean(currentList.archivedAt)) {
          throw new Error("List not found");
        }

        boardIdForRetry = currentList.boardId;

        // Exclude the list being moved so the adjacency search bisects against
        // the real occupants, not the mover's own (stale) slot.
        const nextPosition = await resolveListPosition(tx, {
          boardId: currentList.boardId,
          prevListId: prevHint,
          nextListId: nextHint,
          excludeListId: data.listId,
        });

        return await tx.list.update({
          where: { id: data.listId },
          data: { position: nextPosition },
          select: {
            id: true,
            boardId: true,
            title: true,
            position: true,
            archivedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });
    } catch (error) {
      // A stale neighbour hint is recoverable without a renumber: drop that side
      // and retry so the move re-anchors on the surviving neighbour / appends.
      if (error instanceof StaleNeighborError && attempt < MAX_REORDER_LIST_RETRIES - 1) {
        if (error.side === "prev") {
          prevHint = null;
        } else {
          nextHint = null;
        }
        continue;
      }

      // P2002 (a rival grabbed the slot) or PositionSpaceExhaustedError (no gap
      // left to bisect) both mean: renumber the board, then retry.
      if (
        (isUniqueConstraintError(error) || error instanceof PositionSpaceExhaustedError) &&
        attempt < MAX_REORDER_LIST_RETRIES - 1 &&
        boardIdForRetry
      ) {
        await normalizeListPositions(boardIdForRetry);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to reorder list after retries");
}

export async function archiveList(listId: string): Promise<ListRecord> {
  return db.list.update({
    where: { id: listId },
    data: { archivedAt: new Date() },
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
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
      id: true,
      boardId: true,
      title: true,
      position: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
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
      id: true,
      boardId: true,
      title: true,
      position: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
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

const MAX_RESTORE_LIST_RETRIES = 5;

export async function restoreList(listId: string): Promise<ListRecord> {
  for (let attempt = 0; attempt < MAX_RESTORE_LIST_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
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
          },
        });

        if (updateResult.count === 0) {
          throw new Error("LIST_NOT_FOUND");
        }

        return tx.list.findUniqueOrThrow({
          where: { id: listId },
          select: {
            id: true,
            boardId: true,
            title: true,
            position: true,
            archivedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "LIST_NOT_FOUND") {
        throw error;
      }

      if (isUniqueConstraintError(error)) {
        if (attempt < MAX_RESTORE_LIST_RETRIES - 1) {
          continue;
        }
        throw new Error("Failed to restore list after retrying position conflicts");
      }

      throw error;
    }
  }

  throw new Error("Failed to restore list after retrying position conflicts");
}
