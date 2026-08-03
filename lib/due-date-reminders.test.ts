import { describe, it, expect } from "vitest";

import {
  getActiveMilestones,
  resolveRecipients,
  buildCardSelectionWhere,
  type ReminderCard,
} from "./due-date-reminders";

function makeCard(overrides: Partial<ReminderCard> = {}): ReminderCard {
  return {
    id: "card-1",
    dueDate: new Date("2026-06-26T12:00:00Z"),
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdById: "creator-1",
    members: [{ userId: "member-1" }, { userId: "member-2" }],
    ...overrides,
  };
}

// Helper: freeze "now" so tests are deterministic
const NOW = new Date("2026-06-25T14:00:00Z");

describe("getActiveMilestones", () => {
  it("returns DUE_SOON when within 24h before dueDate", () => {
    // dueDate = 2026-06-26T12:00, NOW = 2026-06-25T14:00
    // diff: 22h before due -> within 24h window
    const card = makeCard();
    expect(getActiveMilestones(card, NOW)).toEqual(["DUE_SOON"]);
  });

  it("returns OVERDUE when more than 1h past dueDate", () => {
    // dueDate = 2026-06-25T10:00, NOW = 2026-06-25T14:00 (4h overdue)
    const card = makeCard({ dueDate: new Date("2026-06-25T10:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual(["OVERDUE"]);
  });

  it("returns empty when dueDate is more than 24h away", () => {
    // dueDate = 2026-06-30T12:00, NOW = 2026-06-25T14:00 (>5 days away)
    const card = makeCard({ dueDate: new Date("2026-06-30T12:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });

  it("returns empty when dueDate is 25h before (just outside window)", () => {
    // dueDate = 2026-06-26T15:00, NOW = 2026-06-25T14:00 (25h before)
    const card = makeCard({ dueDate: new Date("2026-06-26T15:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });

  it("returns empty for completed card", () => {
    const card = makeCard({ completedAt: new Date("2026-06-24T10:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });

  it("returns empty for archived card (HIGH-2)", () => {
    const card = makeCard({ archivedAt: new Date("2026-06-24T10:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });

  it("returns empty for deleted card (HIGH-2)", () => {
    const card = makeCard({ deletedAt: new Date("2026-06-24T10:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });

  it("returns empty when dueDate is null", () => {
    const card = makeCard({ dueDate: null });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });

  it("returns empty when dueDate exactly equals now (neither window)", () => {
    // dueDate == NOW -> not DUE_SOON (dueDate is not strictly > now)
    // and not OVERDUE (now < dueDate + 1h)
    const card = makeCard({ dueDate: NOW });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });

  it("returns OVERDUE when 2h past dueDate", () => {
    // dueDate = 2026-06-25T12:00, NOW = 2026-06-25T14:00 (2h overdue)
    const card = makeCard({ dueDate: new Date("2026-06-25T12:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual(["OVERDUE"]);
  });

  it("returns DUE_SOON at exactly 24h before dueDate (boundary)", () => {
    // dueDate = 2026-06-26T14:00, NOW = 2026-06-25T14:00 (exactly 24h)
    const card = makeCard({ dueDate: new Date("2026-06-26T14:00:00Z") });
    expect(getActiveMilestones(card, NOW)).toEqual(["DUE_SOON"]);
  });

  it("returns empty at exactly 24h + 1ms before dueDate (just outside)", () => {
    // dueDate = 2026-06-26T14:00:00.001, NOW = 2026-06-25T14:00
    // diff = 24h + 1ms -> outside window
    const card = makeCard({ dueDate: new Date("2026-06-26T14:00:00.001Z") });
    expect(getActiveMilestones(card, NOW)).toEqual([]);
  });
});

describe("resolveRecipients", () => {
  it("returns members + creator, deduplicated", () => {
    const card = makeCard();
    const recipients = resolveRecipients(card);
    expect(recipients).toContain("creator-1");
    expect(recipients).toContain("member-1");
    expect(recipients).toContain("member-2");
    expect(recipients).toHaveLength(3);
  });

  it("returns creator only when there are no members", () => {
    const card = makeCard({ members: [] });
    const recipients = resolveRecipients(card);
    expect(recipients).toEqual(["creator-1"]);
  });

  it("deduplicates when creator is also a member", () => {
    const card = makeCard({
      createdById: "user-1",
      members: [{ userId: "user-1" }, { userId: "member-2" }],
    });
    const recipients = resolveRecipients(card);
    expect(recipients).toHaveLength(2);
    expect(recipients).toContain("user-1");
    expect(recipients).toContain("member-2");
  });
});

describe("buildCardSelectionWhere", () => {
  it("filters out completed, archived, and deleted cards", () => {
    const where = buildCardSelectionWhere(NOW);
    expect(where.completedAt).toBeNull();
    expect(where.archivedAt).toBeNull();
    expect(where.deletedAt).toBeNull();
    expect(where.dueDate).toEqual({ not: null });
  });

  it("includes DUE_SOON and OVERDUE conditions", () => {
    const where = buildCardSelectionWhere(NOW);
    expect(where.OR).toHaveLength(2);
  });

  it("excludes cards whose parent list is archived (US-074 Slice B2)", () => {
    const where = buildCardSelectionWhere(NOW);
    expect(where.list).toEqual({ archivedAt: null });
  });
});
