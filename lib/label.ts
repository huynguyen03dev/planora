import db from "./prisma";

export type LabelRecord = {
  id: string;
  boardId: string;
  name: string;
  color: string;
};

export type LabelWithBoardRecord = {
  id: string;
  boardId: string;
  board: {
    id: string;
    workspaceId: string;
    archivedAt: Date | null;
  };
};

const LABEL_SELECT = {
  id: true,
  boardId: true,
  name: true,
  color: true,
} as const;

/** All labels defined on a board, oldest first (stable display order). */
export async function getBoardLabels(boardId: string): Promise<LabelRecord[]> {
  return db.label.findMany({
    where: { boardId },
    orderBy: { createdAt: "asc" },
    select: LABEL_SELECT,
  });
}

/** Labels attached to a single card. */
export async function getCardLabels(cardId: string): Promise<LabelRecord[]> {
  const rows = await db.cardLabel.findMany({
    where: { cardId },
    select: { label: { select: LABEL_SELECT } },
  });

  return rows.map((row) => row.label);
}

/** Load a label with its board + workspace for permission scoping. */
export async function getLabelWithBoard(
  labelId: string,
): Promise<LabelWithBoardRecord | null> {
  return db.label.findUnique({
    where: { id: labelId },
    select: {
      id: true,
      boardId: true,
      board: {
        select: { id: true, workspaceId: true, archivedAt: true },
      },
    },
  });
}

export async function createLabel(data: {
  boardId: string;
  name: string;
  color: string;
}): Promise<LabelRecord> {
  return db.label.create({
    data: {
      boardId: data.boardId,
      name: data.name,
      color: data.color,
    },
    select: LABEL_SELECT,
  });
}

export async function updateLabel(
  labelId: string,
  data: { name: string; color: string },
): Promise<LabelRecord> {
  return db.label.update({
    where: { id: labelId },
    data: { name: data.name, color: data.color },
    select: LABEL_SELECT,
  });
}

/** Deletes a label; CardLabel rows cascade away via the schema relation. */
export async function deleteLabel(labelId: string): Promise<void> {
  await db.label.delete({ where: { id: labelId } });
}

/** Attaches a label to a card. Idempotent: an existing pair is a no-op. */
export async function addCardLabel(
  cardId: string,
  labelId: string,
): Promise<{ changed: boolean }> {
  const existing = await db.cardLabel.findUnique({
    where: { cardId_labelId: { cardId, labelId } },
    select: { cardId: true },
  });

  if (existing) {
    return { changed: false };
  }

  await db.cardLabel.create({ data: { cardId, labelId } });
  return { changed: true };
}

/** Detaches a label from a card. No-op if the pair does not exist. */
export async function removeCardLabel(
  cardId: string,
  labelId: string,
): Promise<{ changed: boolean }> {
  const result = await db.cardLabel.deleteMany({
    where: { cardId, labelId },
  });

  return { changed: result.count > 0 };
}
