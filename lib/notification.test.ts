import { vi, describe, it, expect, beforeEach } from "vitest";
import { getNotificationsForUser, notifyMentioned, notifyDueDate } from "./notification";

// Hoisted mocks — vi.mock factories are hoisted above imports so the data
// must be created via vi.hoisted() to be available.
const mockDb = vi.hoisted(() => ({
  workspaceMember: { findMany: vi.fn() },
  notification: { create: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));

/** Minimal notification shape matching createNotification's select return. */
function mockNotification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "n1",
    userId: "user-2",
    type: "MENTIONED",
    title: "Mentioned in \"Test Card\"",
    message: "Alice mentioned you in a comment on ...",
    linkUrl: "/boards/board-1",
    isRead: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    readAt: null,
    ...overrides,
  };
}

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/realtime/server", () => ({ emitNotificationNew: vi.fn() }));
vi.mock("@/emails/mention-email", () => ({ MentionEmail: vi.fn(() => null) }));
vi.mock("@/emails/due-date-email", () => ({ DueDateEmail: vi.fn(() => null) }));
// NB: ./mention is intentionally NOT mocked. The notify path resolves mentions
// through the real resolveMentions (US-057), so these tests exercise the actual
// matching logic — the prior mock left it unproven.

function makeMember(userId: string, name: string | null, email: string | null) {
  return { userId, user: { name, email } };
}

const defaultData = {
  content: "@Bob look at this card",
  cardId: "card-1",
  cardTitle: "Test Card",
  boardId: "board-1",
  boardTitle: "Test Board",
  commenterUserId: "user-1",
  commenterName: "Alice",
  workspaceId: "ws-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyMentioned email sending", () => {
  it("sends email to mentioned user with correct template", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-1", "Alice", "alice@test.com"),
      makeMember("user-2", "Bob", "bob@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned(defaultData);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@test.com",
        subject: 'You were mentioned in "Test Card"',
      }),
    );
  });

  it("skips email for self-mention", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-1", "Alice", "alice@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned({
      ...defaultData,
      content: "Hey @Alice, check this!",
    });

    // Self-mention is filtered out — no notifications, no emails
    expect(mockDb.notification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips user without email gracefully (notification still created)", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", null),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned(defaultData);

    // Notification IS created
    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    // But email is skipped because Bob has no email
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends multiple emails when multiple users are mentioned", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", "bob@test.com"),
      makeMember("user-3", "Charlie", "charlie@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned({
      ...defaultData,
      content: "Hey @Bob and @Charlie!",
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("still creates notifications when email sending fails", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", "bob@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());
    mockSendEmail.mockRejectedValueOnce(new Error("Email API unavailable"));

    // Should not throw despite email failure
    await expect(notifyMentioned(defaultData)).resolves.toBeUndefined();

    // Notification was still created
    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("resolves a full-name mention through the real resolver", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", "bob@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned(defaultData); // content: "@Bob look at this card"

    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-2", type: "MENTIONED" }),
      }),
    );
  });

  it("does NOT notify on a partial/prefix mention (full-name matching preserved)", async () => {
    // "@Bo" is a prefix of "Bob" — autocomplete would suggest it, but the notify
    // path requires the full name, so no one is notified. This pins the chosen
    // no-behavior-change semantics.
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", "bob@test.com"),
    ]);

    await notifyMentioned({ ...defaultData, content: "@Bo are you around?" });

    expect(mockDb.notification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("resolves a multi-word display name", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", "bob@test.com"),
      makeMember("user-3", "Bob Smith", "bobsmith@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned({ ...defaultData, content: "cc @Bob Smith on this" });

    // Longest-name wins: Bob Smith, not Bob.
    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-3" }),
      }),
    );
  });

  it("one rejecting email does not abort the sibling recipient (allSettled non-abort)", async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", "bob@test.com"),
      makeMember("user-3", "Charlie", "charlie@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());
    // Bob's email rejects. The contract: Charlie's email is still sent, both
    // MENTIONED rows are still created, and notifyMentioned does not throw.
    mockSendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === "bob@test.com") throw new Error("Email API unavailable");
      return undefined;
    });

    await expect(
      notifyMentioned({ ...defaultData, content: "Hey @Bob and @Charlie!" }),
    ).resolves.toBeUndefined();

    expect(mockDb.notification.create).toHaveBeenCalledTimes(2);
    // The sibling (Charlie) was still emailed despite Bob's rejection.
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "charlie@test.com" }),
    );
  });

  it("notifies the LAST member when two share a display name (no recipient swap)", async () => {
    // Duplicate display names: the notify path must pick the same member the
    // pre-US-057 scanner did (last-inserted), not silently swap recipients.
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Sam", "sam1@test.com"),
      makeMember("user-9", "Sam", "sam2@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned({ ...defaultData, content: "@Sam take a look" });

    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-9" }) }),
    );
  });

  it("a member with no name never matches a bare '@' or any mention (guard is load-bearing)", async () => {
    // If a null name leaked through as "", `startsWith("")` would match EVERY
    // '@', notifying the nameless member on every comment. The filter must drop
    // them. Bob (named) still resolves normally.
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("ghost", null, "ghost@test.com"),
      makeMember("user-2", "Bob", "bob@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned({ ...defaultData, content: "email me @ @Bob" });

    // Only Bob — never the nameless "ghost".
    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-2" }) }),
    );
  });

  it("matches a name after an '@' even mid-token, e.g. an email-like 'foo@Bob' (documents existing behavior)", async () => {
    // The scanner keys on any '@', so "foo@Bob" resolves Bob — same as the
    // pre-US-057 behavior. Pinned so a future boundary change is a conscious one.
    mockDb.workspaceMember.findMany.mockResolvedValue([
      makeMember("user-2", "Bob", "bob@test.com"),
    ]);
    mockDb.notification.create.mockResolvedValue(mockNotification());

    await notifyMentioned({ ...defaultData, content: "mail foo@Bob now" });

    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-2" }) }),
    );
  });
});

describe("notifyDueDate", () => {
  const defaultDueData = {
    userId: "user-2",
    cardId: "card-1",
    cardTitle: "Test Card",
    boardId: "board-1",
    boardTitle: "Test Board",
    milestone: "DUE_SOON" as const,
    dueDate: new Date("2026-06-26T12:00:00Z"),
  };

  const mockUser = {
    id: "user-2",
    email: "user2@test.com",
    name: "User Two",
  };

  it("creates a DUE_DATE notification per recipient", async () => {
    mockDb.notification.create.mockResolvedValue(mockNotification({ type: "DUE_DATE" }));
    mockDb.user.findUnique.mockResolvedValue(mockUser);

    await notifyDueDate(defaultDueData);

    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-2",
          type: "DUE_DATE",
          title: expect.stringContaining("due soon"),
        }),
      }),
    );
  });

  it("calls sendEmail per recipient", async () => {
    mockDb.notification.create.mockResolvedValue(mockNotification({ type: "DUE_DATE" }));
    mockDb.user.findUnique.mockResolvedValue(mockUser);

    await notifyDueDate(defaultDueData);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user2@test.com",
        subject: expect.stringContaining("due soon"),
      }),
    );
  });

  it("email throw is caught + logged, notification still created", async () => {
    mockDb.notification.create.mockResolvedValue(mockNotification({ type: "DUE_DATE" }));
    mockDb.user.findUnique.mockResolvedValue(mockUser);
    mockSendEmail.mockRejectedValueOnce(new Error("Email API down"));

    // Should not throw
    await expect(notifyDueDate(defaultDueData)).resolves.toBeUndefined();

    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("overdue milestone uses correct milestone label", async () => {
    mockDb.notification.create.mockResolvedValue(mockNotification({ type: "DUE_DATE" }));
    mockDb.user.findUnique.mockResolvedValue(mockUser);

    await notifyDueDate({
      ...defaultDueData,
      milestone: "OVERDUE",
    });

    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: expect.stringContaining("overdue"),
        }),
      }),
    );
  });

  it("createNotification throw propagates so caller can rollback CardReminder (MEDIUM-1)", async () => {
    mockDb.notification.create.mockRejectedValueOnce(new Error("DB error"));
    mockDb.user.findUnique.mockResolvedValue(mockUser);

    await expect(notifyDueDate(defaultDueData)).rejects.toThrow("DB error");
  });
});

describe("getNotificationsForUser (inbox cursor pagination)", () => {
  beforeEach(() => {
    mockDb.notification.findMany.mockReset();
  });

  it("defaults to the newest 50 with no cursor (legacy behavior)", async () => {
    mockDb.notification.findMany.mockResolvedValue([]);

    await getNotificationsForUser("user-1");

    expect(mockDb.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
    expect(mockDb.notification.findMany.mock.calls[0][0].cursor).toBeUndefined();
    expect(mockDb.notification.findMany.mock.calls[0][0].skip).toBeUndefined();
  });

  it("honors a custom limit", async () => {
    mockDb.notification.findMany.mockResolvedValue([]);

    await getNotificationsForUser("user-1", { limit: 10 });

    expect(mockDb.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it("passes a cursor through with skip:1 so the cursor row is not repeated (pages are disjoint)", async () => {
    mockDb.notification.findMany.mockResolvedValue([]);

    await getNotificationsForUser("user-1", { cursor: "n-50", limit: 50 });

    expect(mockDb.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "n-50" },
        skip: 1,
        // createdAt ties break by id so equal timestamps can't shift rows
        // between pages (no duplicates / no skipped rows).
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("returns the rows the query produces (newest first)", async () => {
    const at = new Date("2026-07-06T00:00:00Z");
    mockDb.notification.findMany.mockResolvedValue([
      { id: "n-2", userId: "user-1", type: "ASSIGNED", title: "B", message: "m", linkUrl: null, isRead: false, createdAt: at, readAt: null },
      { id: "n-1", userId: "user-1", type: "COMMENT", title: "A", message: "m", linkUrl: null, isRead: false, createdAt: at, readAt: null },
    ]);

    const rows = await getNotificationsForUser("user-1", { limit: 2 });

    expect(rows.map((r) => r.id)).toEqual(["n-2", "n-1"]);
  });
});
