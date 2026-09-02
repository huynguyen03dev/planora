/**
 * Server Action tests for `loadMoreCardDetailAction` — the cursor-paginated
 * read of the next comments/activity page for the card detail sheet.
 *
 * Same contract as the US-006 suite: A1 (auth), A2/A3 (membership + workspace
 * isolation — the read gate is `isWorkspaceMember`, matching the automation
 * read actions) and a positive control per section proving the page fetch
 * seam runs with the right cursor. The pagination math itself (cap 50,
 * hasMore, cursor filters) is unit-tested in lib/comment.test.ts and
 * lib/activity.test.ts; here we assert the action forwards the parsed cursor
 * and maps rows to the sheet's UI shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cardWithListAndBoardFixture, formData } from "./_harness";

const WS_A = "A".repeat(31) + "1";
const CARD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CURSOR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const h = vi.hoisted(() => {
  const state = {
    callerId: null as string | null,
    authed: true,
    member: true,
  };
  const fn = () => vi.fn();
  return {
    state,
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) throw new Error("NEXT_REDIRECT");
      return { userId: state.callerId };
    }),
    getCardWithListAndBoard: fn(),
    // Read gate (membership), mirroring the automation read actions.
    isWorkspaceMember: vi.fn(async () => state.member),
    hasWorkspacePermission: vi.fn(async () => true),
    getCommentsByCardId: fn(),
    getActivityByCardId: fn(),
    db: {
      $transaction: vi.fn(),
      card: { update: vi.fn() },
      workspaceMember: { findFirst: vi.fn() },
      user: { findUnique: vi.fn() },
      board: { findUnique: vi.fn() },
    },
    emit: {
      emitAnalyticsRefresh: fn(),
      emitCardMoved: fn(),
      emitListMoved: fn(),
      emitListCreated: fn(),
      emitListRestored: fn(),
      emitListUpdated: fn(),
      emitListDeleted: fn(),
      emitCardCreated: fn(),
      emitCardUpdated: fn(),
      emitCardArchived: fn(),
      emitCardCompletionUpdated: fn(),
      emitCardLabelsUpdated: fn(),
      emitCardMembersUpdated: fn(),
      emitCardMetaUpdated: fn(),
      emitCommentCreated: fn(),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { hasPermission: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/board", () => ({ getBoardById: vi.fn() }));
vi.mock("@/lib/card", () => ({
  getCardWithListAndBoard: h.getCardWithListAndBoard,
}));
vi.mock("@/lib/comment", () => ({
  createComment: vi.fn(),
  getCommentsByCardId: h.getCommentsByCardId,
  COMMENT_PAGE_SIZE: 50,
}));
vi.mock("@/lib/activity", () => ({
  createActivityEntry: vi.fn(),
  getActivityByCardId: h.getActivityByCardId,
  ACTIVITY_PAGE_SIZE: 50,
}));
vi.mock("@/lib/authorization", () => ({
  hasWorkspacePermission: h.hasWorkspacePermission,
  isWorkspaceMember: h.isWorkspaceMember,
}));
vi.mock("@/lib/notification", () => ({
  notifyCardAssigned: vi.fn(),
  notifyCommentOnCard: vi.fn(),
  notifyMentioned: vi.fn(),
}));
vi.mock("@/lib/cloudinary", () => ({
  validateFileForUpload: vi.fn(),
  uploadToCloudinary: vi.fn(),
  getCloudinaryConfig: vi.fn(() => ({ cloudName: "c", apiKey: "k", apiSecret: "s" })),
}));
vi.mock("@/lib/realtime/server", () => ({ ...h.emit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("cloudinary", () => ({
  v2: { uploader: { destroy: vi.fn() }, config: vi.fn() },
}));

import { loadMoreCardDetailAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";

const commentsForm = (extra: Record<string, string> = {}) =>
  formData({ cardId: CARD_ID, section: "comments", ...extra });
const activityForm = (extra: Record<string, string> = {}) =>
  formData({ cardId: CARD_ID, section: "activity", ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = "u1";
  h.state.authed = true;
  h.state.member = true;
});

describe("loadMoreCardDetailAction — security & isolation", () => {
  const card = () => cardWithListAndBoardFixture(WS_A, { cardId: CARD_ID });

  it("A1 auth: an unauthenticated caller is rejected before any read", async () => {
    h.state.authed = false;
    await expect(loadMoreCardDetailAction(commentsForm())).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(h.getCommentsByCardId).not.toHaveBeenCalled();
    expect(h.getActivityByCardId).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the DB", async () => {
    h.getCardWithListAndBoard.mockResolvedValue(card());
    const r = await loadMoreCardDetailAction(
      formData({ cardId: "not-a-uuid", section: "comments" }),
    );
    expect(r.success).toBe(false);
    expect(h.getCardWithListAndBoard).not.toHaveBeenCalled();
  });

  it("rejects an unknown section", async () => {
    const r = await loadMoreCardDetailAction(
      formData({ cardId: CARD_ID, section: "attachments" }),
    );
    expect(r).toEqual({ success: false, error: expect.any(String) });
  });

  it("rejects a missing card with the not-found posture (no membership probe)", async () => {
    h.getCardWithListAndBoard.mockResolvedValue(null);
    const r = await loadMoreCardDetailAction(commentsForm());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expect(h.isWorkspaceMember).not.toHaveBeenCalled();
    expect(h.getCommentsByCardId).not.toHaveBeenCalled();
  });

  it("rejects a card under an archived board", async () => {
    h.getCardWithListAndBoard.mockResolvedValue({
      ...card(),
      board: { ...card().board, archivedAt: new Date() },
    });
    const r = await loadMoreCardDetailAction(commentsForm());
    expect(r).toEqual({ success: false, error: "Card not found" });
  });

  it("A3 isolation: a non-member cannot read another workspace's card feed", async () => {
    h.getCardWithListAndBoard.mockResolvedValue(card());
    h.state.member = false;
    const r = await loadMoreCardDetailAction(commentsForm());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expect(h.getCommentsByCardId).not.toHaveBeenCalled();
    expect(h.getActivityByCardId).not.toHaveBeenCalled();
  });
});

describe("loadMoreCardDetailAction — comments page (positive)", () => {
  const card = () => cardWithListAndBoardFixture(WS_A, { cardId: CARD_ID });

  beforeEach(() => {
    h.getCardWithListAndBoard.mockResolvedValue(card());
  });

  it("forwards the parsed cursor as the compound `after` boundary and maps rows", async () => {
    h.getCommentsByCardId.mockResolvedValue({
      items: [
        {
          id: "c11",
          cardId: CARD_ID,
          userId: "u2",
          content: "Eleventh",
          createdAt: new Date("2026-01-01T00:10:00.000Z"),
          updatedAt: new Date("2026-01-01T00:10:00.000Z"),
          user: { id: "u2", name: "Bob", image: null },
        },
      ],
      hasMore: true,
    });

    const r = await loadMoreCardDetailAction(
      commentsForm({
        cursorCreatedAt: "2026-01-01T00:09:00.000Z",
        cursorId: CURSOR_ID,
      }),
    );

    expect(r).toEqual({
      success: true,
      section: "comments",
      hasMore: true,
      items: [
        {
          id: "c11",
          content: "Eleventh",
          createdAt: "2026-01-01T00:10:00.000Z",
          user: { id: "u2", name: "Bob", image: null },
        },
      ],
    });
    expect(h.getCommentsByCardId).toHaveBeenCalledWith(CARD_ID, {
      limit: 50,
      after: { createdAt: new Date("2026-01-01T00:09:00.000Z"), id: CURSOR_ID },
    });
  });

  it("first page (no cursor) fetches the default page size", async () => {
    h.getCommentsByCardId.mockResolvedValue({ items: [], hasMore: false });
    const r = await loadMoreCardDetailAction(commentsForm());
    expect(r).toEqual({ success: true, section: "comments", hasMore: false, items: [] });
    expect(h.getCommentsByCardId).toHaveBeenCalledWith(CARD_ID, { limit: 50 });
  });

  it("empty-string cursor fields are treated as no cursor", async () => {
    h.getCommentsByCardId.mockResolvedValue({ items: [], hasMore: false });
    await loadMoreCardDetailAction(
      commentsForm({ cursorCreatedAt: "", cursorId: "" }),
    );
    expect(h.getCommentsByCardId).toHaveBeenCalledWith(CARD_ID, { limit: 50 });
  });

  it("a partial cursor (timestamp only) is treated as no cursor", async () => {
    h.getCommentsByCardId.mockResolvedValue({ items: [], hasMore: false });
    await loadMoreCardDetailAction(
      commentsForm({ cursorCreatedAt: "2026-01-01T00:09:00.000Z" }),
    );
    expect(h.getCommentsByCardId).toHaveBeenCalledWith(CARD_ID, { limit: 50 });
  });
});

describe("loadMoreCardDetailAction — activity page (positive)", () => {
  const card = () => cardWithListAndBoardFixture(WS_A, { cardId: CARD_ID });

  beforeEach(() => {
    h.getCardWithListAndBoard.mockResolvedValue(card());
  });

  it("forwards the parsed cursor as the compound `before` boundary and maps rows", async () => {
    h.getActivityByCardId.mockResolvedValue({
      items: [
        {
          id: "a9",
          workspaceId: WS_A,
          boardId: "board-1",
          cardId: CARD_ID,
          userId: "u1",
          action: "UPDATED",
          entityType: "CARD",
          metadata: null,
          createdAt: new Date("2026-01-01T00:09:00.000Z"),
          user: { id: "u1", name: "Alice", image: null },
        },
      ],
      hasMore: false,
    });

    const r = await loadMoreCardDetailAction(
      activityForm({
        cursorCreatedAt: "2026-01-01T00:08:00.000Z",
        cursorId: CURSOR_ID,
      }),
    );

    expect(r).toEqual({
      success: true,
      section: "activity",
      hasMore: false,
      items: [
        {
          id: "a9",
          action: "UPDATED",
          entityType: "CARD",
          createdAt: "2026-01-01T00:09:00.000Z",
          user: { id: "u1", name: "Alice", image: null },
          metadata: null,
        },
      ],
    });
    expect(h.getActivityByCardId).toHaveBeenCalledWith(CARD_ID, {
      limit: 50,
      before: { createdAt: new Date("2026-01-01T00:08:00.000Z"), id: CURSOR_ID },
    });
  });

  it("first page (no cursor) fetches the default page size", async () => {
    h.getActivityByCardId.mockResolvedValue({ items: [], hasMore: false });
    const r = await loadMoreCardDetailAction(activityForm());
    expect(r).toEqual({ success: true, section: "activity", hasMore: false, items: [] });
    expect(h.getActivityByCardId).toHaveBeenCalledWith(CARD_ID, { limit: 50 });
  });
});
