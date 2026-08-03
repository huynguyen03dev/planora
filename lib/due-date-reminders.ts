import "server-only";

/**
 * Pure domain logic for the due-date reminder scheduler.
 *
 * All functions take `now` as a parameter — never call `new Date()` inside,
 * making them deterministic and unit-testable.
 */

// ─── Milestone types ─────────────────────────────────────────────────────────

export type Milestone = "DUE_SOON" | "OVERDUE";

// ─── Card shape needed for reminder selection ────────────────────────────────

export interface ReminderCard {
  id: string;
  dueDate: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdById: string;
  list?: { boardId?: string } | null;
  boardId?: string;
  members: { userId: string }[];
}

// ─── Pure milestone selection ────────────────────────────────────────────────

/**
 * Returns the milestones that are active for a card at the given `now`.
 * A card must be incomplete, non-archived, non-deleted, and have a dueDate.
 */
export function getActiveMilestones(
  card: ReminderCard,
  now: Date,
): Milestone[] {
  if (!card.dueDate) return [];
  if (card.completedAt) return [];
  if (card.archivedAt) return [];
  if (card.deletedAt) return [];

  const due = card.dueDate.getTime();
  const n = now.getTime();
  const active: Milestone[] = [];

  // DUE_SOON: dueDate - 24h <= now < dueDate
  const dayMs = 24 * 60 * 60 * 1000;
  if (n >= due - dayMs && n < due) {
    active.push("DUE_SOON");
  }

  // OVERDUE: now >= dueDate + 1h  (unbounded low side — MEDIUM-3)
  if (n >= due + 60 * 60 * 1000) {
    active.push("OVERDUE");
  }

  return active;
}

// ─── Recipient resolution ────────────────────────────────────────────────────

/**
 * Returns the set of user IDs that should receive a reminder for this card:
 * card members (from CardMember) + card creator, deduplicated.
 * A card with no members notifies only the creator.
 */
export function resolveRecipients(card: ReminderCard): string[] {
  const ids = new Set<string>();
  ids.add(card.createdById);
  for (const member of card.members) {
    ids.add(member.userId);
  }
  return Array.from(ids);
}

// ─── Query builder for the SELECT predicate ──────────────────────────────────

/**
 * Returns the Prisma `where` clause to select candidate cards for a reminder
 * tick at the given `now`. Filters out completed, archived, and deleted cards.
 *
 * The predicate covers both DUE_SOON and OVERDUE candidates in one query.
 */
export function buildCardSelectionWhere(now: Date) {
  const dayMs = 24 * 60 * 60 * 1000;

  return {
    dueDate: { not: null },
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    // US-074 Slice B2: exclude cards whose parent list is archived.
    list: { archivedAt: null },
    OR: [
      {
        // DUE_SOON: dueDate - 24h <= now < dueDate  (dueDate strictly in the future)
        dueDate: { lte: new Date(now.getTime() + dayMs), gt: now },
      },
      {
        // OVERDUE: now >= dueDate + 1h
        dueDate: { lte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    ],
  };
}
