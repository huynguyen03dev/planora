import { vi, describe, it, expect, beforeEach } from "vitest";
import { notifyMentioned, notifyDueDate } from "./notification";

// Hoisted mocks — vi.mock factories are hoisted above imports so the data
// must be created via vi.hoisted() to be available.
const mockDb = vi.hoisted(() => ({
  workspaceMember: { findMany: vi.fn() },
  notification: { create: vi.fn() },
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
vi.mock("./mention", () => ({
  parseMentions: vi.fn(),
  mentionMatchesName: vi.fn(),
  extractMentionQuery: vi.fn(),
}));

function makeMember(userId: string, name: string, email: string | null) {
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
