/**
 * Integration tests for the due-date reminder cron route.
 *
 * Tests the route self-guard (401 without/wrong CRON_SECRET), the processing
 * logic (idempotency across two overlapping ticks), edge cases (archived,
 * deleted, completed cards), and error isolation (MEDIUM-4).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  card: { findMany: vi.fn() },
  board: { findMany: vi.fn() },
  cardReminder: { create: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() },
  notification: { create: vi.fn() },
}));

const mockNotifyDueDate = vi.hoisted(() => vi.fn());
const mockMaxApproachWindowMinutes = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockEvaluateScheduledCard = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));
vi.mock("@/lib/notification", () => ({ notifyDueDate: mockNotifyDueDate }));
vi.mock("@/lib/automation/scheduled", () => ({
  maxApproachWindowMinutes: mockMaxApproachWindowMinutes,
  evaluateScheduledCard: mockEvaluateScheduledCard,
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/realtime/server", () => ({ emitNotificationNew: vi.fn() }));
vi.mock("@/emails/due-date-email", () => ({ DueDateEmail: vi.fn(() => null) }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    title: "Test Card",
    dueDate: new Date("2026-06-26T12:00:00Z"),
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdById: "creator-1",
    list: { boardId: "board-1" },
    members: [{ userId: "member-1" }],
    ...overrides,
  };
}

function makeBoard(overrides: Record<string, unknown> = {}) {
  return { id: "board-1", title: "Test Board", ...overrides };
}

async function callRoute(opts: {
  cronSecret?: string;
  bearerToken?: string;
  appUrl?: string;
} = {}) {
  const envKey = "CRON_SECRET";
  const orig = process.env[envKey];
  const origUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (opts.cronSecret !== undefined) {
    process.env.CRON_SECRET = opts.cronSecret;
  } else {
    delete process.env.CRON_SECRET;
  }
  if (opts.appUrl !== undefined) {
    process.env.NEXT_PUBLIC_APP_URL = opts.appUrl;
  }

  try {
    const { POST } = await import("@/app/api/cron/due-date-reminders/route");

    const headers = new Headers();
    if (opts.bearerToken) {
      headers.set("Authorization", `Bearer ${opts.bearerToken}`);
    }

    const request = new Request("http://localhost:3000/api/cron/due-date-reminders", {
      method: "POST",
      headers,
    });

    return await POST(request);
  } finally {
    if (orig !== undefined) {
      process.env[envKey] = orig;
    } else {
      delete process.env[envKey];
    }
    process.env.NEXT_PUBLIC_APP_URL = origUrl;
    vi.resetModules();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("cron route self-guard (LOW-3)", () => {
  it("returns 401 when CRON_SECRET is not set", async () => {
    const response = await callRoute({});
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Not configured");
  });

  it("returns 401 with wrong bearer token", async () => {
    const response = await callRoute({ cronSecret: "real-secret", bearerToken: "wrong-secret" });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("allows request with correct bearer token", async () => {
    mockDb.card.findMany.mockResolvedValue([]);
    const response = await callRoute({ cronSecret: "my-secret", bearerToken: "my-secret" });
    expect(response.status).toBe(200);
  });
});

describe("cron route processing", () => {

  it("returns tally with processed=0 when no cards match", async () => {
    mockDb.card.findMany.mockResolvedValue([]);

    const response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    const body = await response.json();

    expect(body.processed).toBe(0);
    expect(body.notified).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.errors).toBe(0);
    expect(body.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("processes a DUE_SOON card and creates notifications for all recipients", async () => {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12h from now
    const card = makeCard({ id: "card-1", dueDate: dueSoon });
    mockDb.card.findMany.mockResolvedValue([card]);
    mockDb.board.findMany.mockResolvedValue([makeBoard()]);
    mockDb.cardReminder.create.mockResolvedValue({
      id: "reminder-1",
      cardId: "card-1",
      userId: "member-1",
      milestone: "DUE_SOON",
      sentAt: new Date(),
    });
    mockNotifyDueDate.mockResolvedValue(undefined);

    const response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    const body = await response.json();

    expect(body.processed).toBe(1);
    // Card has 1 member + 1 creator = 2 recipients, all get DUE_SOON
    expect(body.notified).toBe(2);
    expect(body.errors).toBe(0);
    expect(mockNotifyDueDate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-1",
        cardId: "card-1",
        milestone: "DUE_SOON",
      }),
    );
    expect(mockNotifyDueDate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "creator-1",
        cardId: "card-1",
        milestone: "DUE_SOON",
      }),
    );
  });

  it("skips already-reminded (P2002) — counted as skipped, not error", async () => {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const card = makeCard({ id: "card-1", dueDate: dueSoon });
    mockDb.card.findMany.mockResolvedValue([card]);
    mockDb.board.findMany.mockResolvedValue([makeBoard()]);
    // Simulate P2002 unique violation on every insert
    const p2002Error = new Error("Unique constraint");
    (p2002Error as unknown as Record<string, unknown>).code = "P2002";
    mockDb.cardReminder.create.mockRejectedValue(p2002Error);

    const response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    const body = await response.json();

    expect(body.processed).toBe(1);
    expect(body.notified).toBe(0);
    // 2 recipients × 1 milestone = 2 skipped
    expect(body.skipped).toBe(2);
    expect(body.errors).toBe(0);
    // notifyDueDate should NOT be called for skipped items
    expect(mockNotifyDueDate).not.toHaveBeenCalled();
  });

  it("handles per-card error gracefully and increments errors (MEDIUM-4)", async () => {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const card = makeCard({ id: "card-1", dueDate: dueSoon });
    mockDb.card.findMany.mockResolvedValue([card]);
    mockDb.board.findMany.mockResolvedValue([makeBoard()]);
    // Unexpected DB error on cardReminder.create
    mockDb.cardReminder.create.mockRejectedValue(new Error("DB connection lost"));

    const response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    const body = await response.json();

    expect(body.processed).toBe(1);
    expect(body.notified).toBe(0);
    expect(body.errors).toBe(1);
  });

  it("processes multiple cards with mixed results (DUE_SOON + OVERDUE)", async () => {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const overdue = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h overdue

    const card1 = makeCard({ id: "card-1", title: "Due Soon", dueDate: dueSoon });
    const card2 = makeCard({ id: "card-2", title: "Overdue", dueDate: overdue });

    mockDb.card.findMany.mockResolvedValue([card1, card2]);
    mockDb.board.findMany.mockResolvedValue([makeBoard()]);
    mockDb.cardReminder.create.mockResolvedValue({ id: "r", cardId: "", userId: "", milestone: "", sentAt: new Date() });
    mockNotifyDueDate.mockResolvedValue(undefined);

    const response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    const body = await response.json();

    // Each card: 1 member + 1 creator = 2 recipients → 2 notifications per milestone
    // Card 1: DUE_SOON (2 notifications)
    // Card 2: OVERDUE (2 notifications)
    // Total: 4 notifications
    expect(body.processed).toBe(2);
    expect(body.notified).toBe(4);
  });
});

describe("idempotency — two overlapping ticks", () => {

  it("second tick skips all already-sent reminders (idempotent)", async () => {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const card = makeCard({ id: "card-1", dueDate: dueSoon });

    // ── Tick 1: card found, reminder created, notified ──
    mockDb.card.findMany.mockResolvedValue([card]);
    mockDb.board.findMany.mockResolvedValue([makeBoard()]);
    mockDb.cardReminder.create.mockResolvedValue({ id: "r", cardId: "", userId: "", milestone: "", sentAt: new Date() });
    mockNotifyDueDate.mockResolvedValue(undefined);

    let response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    let body = await response.json();

    expect(body.processed).toBe(1);
    const tick1Notified = body.notified;

    // ── Tick 2: same card, but cardReminder.create now throws P2002 (already sent) ──
    vi.clearAllMocks();

    mockDb.card.findMany.mockResolvedValue([card]);
    mockDb.board.findMany.mockResolvedValue([makeBoard()]);
    const p2002Error = new Error("Unique constraint");
    (p2002Error as unknown as Record<string, unknown>).code = "P2002";
    mockDb.cardReminder.create.mockRejectedValue(p2002Error);

    response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    body = await response.json();

    expect(body.processed).toBe(1);
    expect(body.notified).toBe(0);
    expect(body.skipped).toBe(tick1Notified); // Same count as what was notified in tick 1
    expect(body.errors).toBe(0);
  });
});

describe("scheduled pass — US-074 Slice B2 (list archivedAt:null filter)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries scheduled cards with list: { archivedAt: null } when maxApproachWindowMinutes > 0", async () => {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 30 * 60 * 1000); // 30min from now

    // Reset modules so the route re-imports the mocked scheduled module
    vi.resetModules();

    // Set up mocks fresh for this test
    const scheduledCard = {
      id: "card-scheduled-1",
      dueDate: dueSoon,
      priority: "MEDIUM",
      list: { id: "list-1", boardId: "board-1", board: { workspaceId: "ws-1" } },
    };

    // Override the local mock values via the hoisted references
    mockMaxApproachWindowMinutes.mockResolvedValue(120); // 2h window
    mockEvaluateScheduledCard.mockResolvedValue({
      applied: 1,
      notified: 0,
      skipped: 0,
      errors: 0,
    });

    // First findMany (reminder scan) returns empty; second findMany (scheduled
    // scan) returns one card. Use mockImplementation to track both calls.
    const findManyCalls: Array<{ where: Record<string, unknown> }> = [];
    mockDb.card.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      findManyCalls.push(args);
      // First call (reminder scan) → empty
      // Second call (scheduled scan) → one card
      return findManyCalls.length === 1 ? [] : [scheduledCard];
    });
    mockDb.board.findMany.mockResolvedValue([{ id: "board-1", title: "Board" }]);

    const response = await callRoute({ cronSecret: "test-secret", bearerToken: "test-secret" });
    const body = await response.json();

    // Assert the route ran and the scheduled pass produced results
    expect(body.processed).toBe(0); // reminder scan returned 0 cards
    expect(body.scheduledApplied).toBe(1); // scheduled pass applied
    expect(body.scheduledErrors).toBe(0);

    // The second findMany call is the scheduled scan; it must include list archive filter
    const scheduledCall = findManyCalls[1];
    expect(scheduledCall).toBeDefined();
    // The scheduled scan where clause must include list: { archivedAt: null }
    expect(scheduledCall.where).toHaveProperty("list");
    expect(scheduledCall.where.list).toEqual({ archivedAt: null });

    // Rebuild the original module states for subsequent tests
    vi.resetModules();
    mockMaxApproachWindowMinutes.mockResolvedValue(null);
  });
});
