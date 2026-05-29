import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { $Enums } from "@/app/generated/prisma/client";
import db from "@/lib/prisma";

export type CardHistoryEventType = $Enums.CardHistoryEventType;

// Re-export the enum values for convenience
export const CardHistoryEventType = $Enums.CardHistoryEventType;

// Metadata types for each event per PRD contract
export type CardCreatedMetadata = {
  listId: string;
  listIsDone: boolean;
  estimateHours: number | null;
  dueDate: string | null;
  memberIds: string[];
  archivedAt: string | null;
  deletedAt: string | null;
};

export type CardMovedMetadata = {
  fromListId: string;
  toListId: string;
  fromListIsDone: boolean;
  toListIsDone: boolean;
  memberIds: string[];
  estimateHours: number | null;
};

export type CardCompletedMetadata = {
  listId: string;
  estimateHours: number | null;
  dueDate: string | null;
  memberIds: string[];
  firstCompletion: boolean;
};

export type CardReopenedMetadata = {
  listId: string;
  dueDate: string | null;
  memberIds: string[];
};

export type EstimateChangedMetadata = {
  previousEstimateHours: number | null;
  nextEstimateHours: number | null;
  memberIds: string[];
};

export type DueDateChangedMetadata = {
  previousDueDate: string | null;
  nextDueDate: string | null;
  memberIds: string[];
};

export type CardMemberChangedMetadata = {
  targetUserId: string;
  memberIds: string[];
};

export type CardArchivedMetadata = {
  memberIds: string[];
  estimateHours: number | null;
  dueDate: string | null;
};

export type CardDeletedMetadata = {
  memberIds: string[];
  estimateHours: number | null;
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
};

export type BaselineCapturedMetadata = {
  listId: string;
  listIsDone: boolean;
  estimateHours: number | null;
  dueDate: string | null;
  memberIds: string[];
  archivedAt: string | null;
  deletedAt: string | null;
  completedAt: string | null;
};

export type CardHistoryEventMetadata =
  | CardCreatedMetadata
  | CardMovedMetadata
  | CardCompletedMetadata
  | CardReopenedMetadata
  | EstimateChangedMetadata
  | DueDateChangedMetadata
  | CardMemberChangedMetadata
  | CardArchivedMetadata
  | CardDeletedMetadata
  | BaselineCapturedMetadata;

// Input type for building a card history event
export type BuildCardHistoryEventInput = {
  workspaceId: string;
  boardId: string;
  cardId: string;
  actorId?: string | null;
  eventType: CardHistoryEventType;
  occurredAt?: Date;
  metadata: CardHistoryEventMetadata;
};

export type BuildCardMoveLifecycleEventsInput = {
  workspaceId: string;
  boardId: string;
  cardId: string;
  actorId?: string | null;
  fromListId: string;
  toListId: string;
  fromListIsDone: boolean;
  toListIsDone: boolean;
  estimateHours: number | null;
  dueDate: string | null;
  memberIds: string[];
  completedAtBeforeMove: Date | null;
};

// Input type for listing card history events
export type ListCardHistoryEventsInput = {
  workspaceId: string;
  boardId?: string;
  cardId?: string;
  eventType?: CardHistoryEventType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

/**
 * Build a Prisma create input for a card history event.
 * Callers should use this inside a transaction to append events atomically.
 */
export function buildCardHistoryEvent(
  input: BuildCardHistoryEventInput,
): Prisma.CardHistoryEventCreateManyInput {
  if (!input.metadata || typeof input.metadata !== "object") {
    throw new Error("Card history event metadata is required");
  }

  return {
    workspaceId: input.workspaceId,
    boardId: input.boardId,
    cardId: input.cardId,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    occurredAt: input.occurredAt ?? new Date(),
    metadata: input.metadata as Prisma.InputJsonValue,
  };
}

/**
 * Record multiple card history events in a single transaction.
 * Uses createMany for efficiency when appending multiple ordered events.
 */
export async function recordCardHistoryEvents(
  tx: Prisma.TransactionClient,
  events: BuildCardHistoryEventInput[],
): Promise<void> {
  if (events.length === 0) return;

  const createInputs = events.map(buildCardHistoryEvent);

  await tx.cardHistoryEvent.createMany({
    data: createInputs,
    skipDuplicates: false,
  });
}

/**
 * List card history events for a workspace with optional filters.
 * Results are ordered by sequence (guaranteed ordering) and then occurredAt.
 */
export type CardHistoryEventRecord = {
  id: string;
  sequence: bigint;
  workspaceId: string;
  boardId: string;
  cardId: string;
  actorId: string | null;
  eventType: CardHistoryEventType;
  occurredAt: Date;
  metadata: CardHistoryEventMetadata | null;
};

function toCardHistoryEventMetadata(
  value: Prisma.JsonValue,
): CardHistoryEventMetadata | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as CardHistoryEventMetadata;
}

export async function listCardHistoryEventsForWorkspace(
  input: ListCardHistoryEventsInput,
  tx?: Prisma.TransactionClient,
): Promise<CardHistoryEventRecord[]> {
  const client = tx ?? db;

  const events = await client.cardHistoryEvent.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.boardId && { boardId: input.boardId }),
      ...(input.cardId && { cardId: input.cardId }),
      ...(input.eventType && { eventType: input.eventType }),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from && { gte: input.from }),
              ...(input.to && { lte: input.to }),
            },
          }
        : {}),
    },
    orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }],
    ...(input.limit && { take: input.limit }),
    ...(input.offset && { skip: input.offset }),
  });

  return events.map((event) => ({
    ...event,
    metadata: toCardHistoryEventMetadata(event.metadata),
  }));
}

/**
 * Get the latest history event for a specific card.
 * Useful for reconstructing current state from history.
 */
export async function getLatestCardHistoryEvent(
  tx: Prisma.TransactionClient,
  cardId: string,
): Promise<CardHistoryEventRecord | null> {
  const event = await tx.cardHistoryEvent.findFirst({
    where: { cardId },
    orderBy: [{ sequence: "desc" }, { occurredAt: "desc" }],
  });

  if (!event) {
    return null;
  }

  return {
    ...event,
    metadata: toCardHistoryEventMetadata(event.metadata),
  };
}

/**
 * Get card history events for a specific card in chronological order.
 */
export async function getCardHistoryEvents(
  tx: Prisma.TransactionClient,
  cardId: string,
): Promise<CardHistoryEventRecord[]> {
  const events = await tx.cardHistoryEvent.findMany({
    where: { cardId },
    orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }],
  });

  return events.map((event) => ({
    ...event,
    metadata: toCardHistoryEventMetadata(event.metadata),
  }));
}

// Event builder helpers for domain-specific events
// These provide type-safe builders for each event type per PRD metadata contract

export function buildCardCreatedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardCreatedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_CREATED,
    metadata,
  };
}

export function buildCardMovedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardMovedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_MOVED,
    metadata,
  };
}

export function buildCardMoveLifecycleEvents(
  input: BuildCardMoveLifecycleEventsInput,
): BuildCardHistoryEventInput[] {
  const events: BuildCardHistoryEventInput[] = [
    buildCardMovedEvent(
      input.workspaceId,
      input.boardId,
      input.cardId,
      {
        fromListId: input.fromListId,
        toListId: input.toListId,
        fromListIsDone: input.fromListIsDone,
        toListIsDone: input.toListIsDone,
        memberIds: input.memberIds,
        estimateHours: input.estimateHours,
      },
      input.actorId,
    ),
  ];

  if (!input.fromListIsDone && input.toListIsDone) {
    events.push(
      buildCardCompletedEvent(
        input.workspaceId,
        input.boardId,
        input.cardId,
        {
          listId: input.toListId,
          estimateHours: input.estimateHours,
          dueDate: input.dueDate,
          memberIds: input.memberIds,
          firstCompletion: input.completedAtBeforeMove === null,
        },
        input.actorId,
      ),
    );
  } else if (input.fromListIsDone && !input.toListIsDone) {
    events.push(
      buildCardReopenedEvent(
        input.workspaceId,
        input.boardId,
        input.cardId,
        {
          listId: input.toListId,
          dueDate: input.dueDate,
          memberIds: input.memberIds,
        },
        input.actorId,
      ),
    );
  }

  return events;
}

export function buildCardCompletedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardCompletedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_COMPLETED,
    metadata,
  };
}

export function buildCardReopenedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardReopenedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_REOPENED,
    metadata,
  };
}

export function buildEstimateSetEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: EstimateChangedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.ESTIMATE_SET,
    metadata,
  };
}

export function buildEstimateChangedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: EstimateChangedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.ESTIMATE_CHANGED,
    metadata,
  };
}

export function buildDueDateSetEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: DueDateChangedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.DUE_DATE_SET,
    metadata,
  };
}

export function buildDueDateChangedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: DueDateChangedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.DUE_DATE_CHANGED,
    metadata,
  };
}

export function buildDueDateClearedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: DueDateChangedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.DUE_DATE_CLEARED,
    metadata,
  };
}

export function buildCardMemberAssignedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardMemberChangedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_MEMBER_ASSIGNED,
    metadata,
  };
}

export function buildCardMemberUnassignedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardMemberChangedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_MEMBER_UNASSIGNED,
    metadata,
  };
}

export function buildCardArchivedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardArchivedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_ARCHIVED,
    metadata,
  };
}

export function buildCardRestoredEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardArchivedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_RESTORED,
    metadata,
  };
}

export function buildCardDeletedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: CardDeletedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.CARD_DELETED,
    metadata,
  };
}

export function buildBaselineCapturedEvent(
  workspaceId: string,
  boardId: string,
  cardId: string,
  metadata: BaselineCapturedMetadata,
  actorId?: string | null,
): BuildCardHistoryEventInput {
  return {
    workspaceId,
    boardId,
    cardId,
    actorId,
    eventType: CardHistoryEventType.BASELINE_CAPTURED,
    metadata,
  };
}
