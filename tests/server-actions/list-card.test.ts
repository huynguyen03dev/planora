/**
 * US-006 — Server Action security tests: list, card, comment, member & label
 * actions in `boards/[boardId]/actions.ts`.
 *
 * Same contract as board.test.ts: A1 (auth) / A2 (permission) / A3 (isolation)
 * + a positive control per action. The auth seam (`auth.api.hasPermission`) is
 * mocked one layer below `hasWorkspacePermission`, so the real resource→workspace
 * derivation runs.
 *
 * Positive controls here assert the action *reached its write seam* (the lib
 * mutation or `db.$transaction`) once permission is granted — not the full
 * success payload. That keeps the suite focused on the security boundary without
 * deep-mocking every transaction body, while still proving denials aren't
 * vacuous (an allowed caller really does proceed to write).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cardWithListAndBoardFixture,
  cardWithListAndMembersFixture,
  expectNoWrites,
  formData,
  labelWithBoardFixture,
  listWithBoardFixture,
  roleGrants,
  type Role,
} from "./_harness";

const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";
const BOARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOARD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LIST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_LIST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CARD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LABEL_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const COLOR = "#0079BF";

const h = vi.hoisted(() => {
  const state = {
    callerId: null as string | null,
    authed: true,
    membership: new Map<string, "admin" | "editor" | "viewer">(),
  };
  const checkRef = { fn: null as null | ((ws: string, perms: Record<string, string[]>) => boolean) };
  const fn = () => vi.fn();
  return {
    state,
    checkRef,
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) throw new Error("NEXT_REDIRECT");
      return { userId: state.callerId };
    }),
    hasPermission: vi.fn(async ({ body }: { body: { organizationId: string; permissions: Record<string, string[]> } }) => ({
      success: checkRef.fn ? checkRef.fn(body.organizationId, body.permissions) : false,
    })),
    // loaders
    getBoardById: fn(),
    getListWithBoard: fn(),
    getCardWithListAndBoard: fn(),
    getCardWithListAndMembers: fn(),
    getLabelWithBoard: fn(),
    getCardLabels: fn(),
    getCardIdsWithLabel: fn(),
    // lib write seams
    createList: fn(),
    updateListTitle: fn(),
    updateListIsDone: fn(),
    reorderListByNeighbors: fn(),
    updateCardDetails: fn(),
    reorderCardWithinListByNeighbors: fn(),
    createComment: fn(),
    createAttachment: fn(),
    createActivityEntry: fn(),
    createLabel: fn(),
    updateLabel: fn(),
    deleteLabel: fn(),
    addCardLabel: fn(),
    removeCardLabel: fn(),
    validateFileForUpload: fn(),
    uploadToCloudinary: fn(),
    // prisma spies
    db: {
      $transaction: vi.fn(),
      card: { update: vi.fn() },
      workspace: { findUnique: vi.fn() },
      workspaceMember: { findFirst: vi.fn() },
      cardMember: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      board: { findUnique: vi.fn() },
    },
    // realtime emitters
    emit: {
      emitAnalyticsRefresh: fn(),
      emitCardMoved: fn(),
      emitListMoved: fn(),
      emitListCreated: fn(),
      emitListUpdated: fn(),
      emitListDeleted: fn(),
      emitCardCreated: fn(),
      emitCardUpdated: fn(),
      emitCardArchived: fn(),
      emitCardLabelsUpdated: fn(),
      emitCommentCreated: fn(),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/board", () => ({ getBoardById: h.getBoardById }));
vi.mock("@/lib/list", () => ({
  getListWithBoard: h.getListWithBoard,
  createList: h.createList,
  updateListTitle: h.updateListTitle,
  updateListIsDone: h.updateListIsDone,
  reorderListByNeighbors: h.reorderListByNeighbors,
}));
vi.mock("@/lib/card", () => ({
  getCardWithListAndBoard: h.getCardWithListAndBoard,
  getCardWithListAndMembers: h.getCardWithListAndMembers,
  updateCardDetails: h.updateCardDetails,
  reorderCardWithinListByNeighbors: h.reorderCardWithinListByNeighbors,
}));
vi.mock("@/lib/label", () => ({
  getLabelWithBoard: h.getLabelWithBoard,
  getCardLabels: h.getCardLabels,
  getCardIdsWithLabel: h.getCardIdsWithLabel,
  createLabel: h.createLabel,
  updateLabel: h.updateLabel,
  deleteLabel: h.deleteLabel,
  addCardLabel: h.addCardLabel,
  removeCardLabel: h.removeCardLabel,
}));
vi.mock("@/lib/comment", () => ({ createComment: h.createComment }));
vi.mock("@/lib/attachment", () => ({ createAttachment: h.createAttachment }));
vi.mock("@/lib/activity", () => ({ createActivityEntry: h.createActivityEntry }));
vi.mock("@/lib/notification", () => ({ notifyCardAssigned: vi.fn(), notifyCommentOnCard: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({
  validateFileForUpload: h.validateFileForUpload,
  uploadToCloudinary: h.uploadToCloudinary,
}));
vi.mock("@/lib/realtime/server", () => ({ ...h.emit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  createListAction,
  updateListAction,
  updateListIsDoneAction,
  deleteListAction,
  createCardAction,
  archiveCardAction,
  reorderListAction,
  reorderCardAction,
  updateCardEstimateAction,
  updateCardDueDateAction,
  moveCardAction,
  updateCardDetailsAction,
  createCommentAction,
  uploadAttachmentAction,
  assignCardMemberAction,
  removeCardMemberAction,
  createLabelAction,
  updateLabelAction,
  deleteLabelAction,
  addCardLabelAction,
  removeCardLabelAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";

// Every mutation/emit seam. A denied path must touch NONE of these.
const writeSeams = [
  h.createList, h.updateListTitle, h.updateListIsDone, h.reorderListByNeighbors,
  h.updateCardDetails, h.reorderCardWithinListByNeighbors, h.createComment,
  h.createAttachment, h.createActivityEntry, h.createLabel, h.updateLabel,
  h.deleteLabel, h.addCardLabel, h.removeCardLabel,
  h.db.$transaction, h.db.card.update,
  ...Object.values(h.emit),
];

function signInAs(userId: string, ws: string, role: Role) {
  h.state.authed = true;
  h.state.callerId = userId;
  h.state.membership.set(`${userId}:${ws}`, role);
}
function signOut() {
  h.state.authed = false;
  h.state.callerId = null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  h.state.membership.clear();
  h.db.$transaction.mockResolvedValue(undefined);
});

/* ─── List actions (workspace from getListWithBoard / getBoardById) ─────── */

describe("createListAction", () => {
  const form = () => formData({ boardId: BOARD_A, title: "List" });

  it("A1 auth: signed out → throws, no write", async () => {
    signOut();
    await expect(createListAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    const r = await createListAction(form());
    expect(r).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B editor cannot create a list on a WS-A board", async () => {
    signInAs("u", WS_B, "editor");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    const r = await createListAction(form());
    expect(r).toEqual({ success: false, error: "Board not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor reaches the write seam", async () => {
    signInAs("u", WS_A, "editor");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    h.createList.mockResolvedValue({ id: "l", boardId: BOARD_A, title: "List", isDone: false, position: 1 });
    const r = await createListAction(form());
    expect(r).toEqual({ success: true, listId: "l" });
    expect(h.createList).toHaveBeenCalled();
  });
});

describe("updateListAction", () => {
  const form = () => formData({ listId: LIST_ID, title: "Renamed" });
  it("A1 auth", async () => {
    signOut();
    await expect(updateListAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await updateListAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied on WS-A list", async () => {
    signInAs("u", WS_B, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await updateListAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    h.updateListTitle.mockResolvedValue(undefined);
    expect(await updateListAction(form())).toEqual({ success: true });
    expect(h.updateListTitle).toHaveBeenCalled();
  });
});

describe("updateListIsDoneAction", () => {
  const form = () => formData({ listId: LIST_ID, isDone: "true" });
  it("A1 auth", async () => {
    signOut();
    await expect(updateListIsDoneAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await updateListIsDoneAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied on WS-A list", async () => {
    signInAs("u", WS_B, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await updateListIsDoneAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    h.updateListIsDone.mockResolvedValue(undefined);
    expect(await updateListIsDoneAction(form())).toEqual({ success: true });
    expect(h.updateListIsDone).toHaveBeenCalled();
  });
});

describe("deleteListAction (delete is editor+admin)", () => {
  const form = () => formData({ listId: LIST_ID });
  it("A1 auth", async () => {
    signOut();
    await expect(deleteListAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await deleteListAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B admin denied on WS-A list", async () => {
    signInAs("u", WS_B, "admin");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await deleteListAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    await deleteListAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

/* ─── Card actions ──────────────────────────────────────────────────────── */

describe("createCardAction", () => {
  const form = () => formData({ listId: LIST_ID, title: "Card" });
  it("A1 auth", async () => {
    signOut();
    await expect(createCardAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await createCardAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await createCardAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    await createCardAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

describe("archiveCardAction (card:delete)", () => {
  const form = () => formData({ cardId: CARD_ID });
  it("A1 auth", async () => {
    signOut();
    await expect(archiveCardAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await archiveCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B admin denied", async () => {
    signInAs("u", WS_B, "admin");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await archiveCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    await archiveCardAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

describe("reorderListAction", () => {
  const form = () => formData({ listId: LIST_ID });
  it("A1 auth", async () => {
    signOut();
    await expect(reorderListAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await reorderListAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    expect(await reorderListAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    h.reorderListByNeighbors.mockResolvedValue({ id: LIST_ID, position: 1 });
    expect(await reorderListAction(form())).toEqual({ success: true });
    expect(h.reorderListByNeighbors).toHaveBeenCalled();
  });
});

describe("reorderCardAction", () => {
  const form = () => formData({ cardId: CARD_ID });
  it("A1 auth", async () => {
    signOut();
    await expect(reorderCardAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await reorderCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await reorderCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.reorderCardWithinListByNeighbors.mockResolvedValue({ id: CARD_ID, listId: LIST_ID, position: 1 });
    expect(await reorderCardAction(form())).toEqual({ success: true });
    expect(h.reorderCardWithinListByNeighbors).toHaveBeenCalled();
  });
});

describe("updateCardEstimateAction", () => {
  const form = () => formData({ cardId: CARD_ID, estimateHours: "4" });
  it("A1 auth", async () => {
    signOut();
    await expect(updateCardEstimateAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A));
    expect(await updateCardEstimateAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A));
    expect(await updateCardEstimateAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A));
    await updateCardEstimateAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

describe("updateCardDueDateAction", () => {
  const form = () => formData({ cardId: CARD_ID, dueDate: "2026-01-01" });
  it("A1 auth", async () => {
    signOut();
    await expect(updateCardDueDateAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A));
    expect(await updateCardDueDateAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A));
    expect(await updateCardDueDateAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A));
    await updateCardDueDateAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

describe("moveCardAction (two-workspace — the sharpest case)", () => {
  const form = () => formData({ cardId: CARD_ID, targetListId: TARGET_LIST });

  // Source card + target list both on the SAME board (BOARD_A / WS_A).
  function sameBoardSetup() {
    h.getCardWithListAndBoard.mockResolvedValue(
      cardWithListAndBoardFixture(WS_A, { boardId: BOARD_A, cardId: CARD_ID, listId: LIST_ID }),
    );
    h.getListWithBoard.mockResolvedValue(
      listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: TARGET_LIST }),
    );
    h.getCardWithListAndMembers.mockResolvedValue(
      cardWithListAndMembersFixture(WS_A, { boardId: BOARD_A, cardId: CARD_ID }),
    );
    h.db.workspace.findUnique.mockResolvedValue({ requireEstimateBeforeDone: false });
  }

  it("A1 auth", async () => {
    signOut();
    await expect(moveCardAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    sameBoardSetup();
    expect(await moveCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 WS-B editor denied on a WS-A card", async () => {
    signInAs("u", WS_B, "editor");
    sameBoardSetup();
    expect(await moveCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });

  it("cross-workspace: target list on a DIFFERENT board is rejected before any write — even for a WS-A admin", async () => {
    // The same-board guard (target.list.boardId !== card.list.boardId) blocks a
    // cross-board (hence cross-workspace) relocation. Caller is fully privileged
    // in WS_A to prove the rejection is structural, not a permission artifact.
    signInAs("u", WS_A, "admin");
    h.getCardWithListAndBoard.mockResolvedValue(
      cardWithListAndBoardFixture(WS_A, { boardId: BOARD_A, cardId: CARD_ID, listId: LIST_ID }),
    );
    h.getListWithBoard.mockResolvedValue(
      listWithBoardFixture(WS_B, { boardId: BOARD_B, listId: TARGET_LIST }),
    );
    expect(await moveCardAction(form())).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor, same board → reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    sameBoardSetup();
    await moveCardAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

describe("updateCardDetailsAction", () => {
  const form = () => formData({ cardId: CARD_ID, title: "T" });
  it("A1 auth", async () => {
    signOut();
    await expect(updateCardDetailsAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await updateCardDetailsAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await updateCardDetailsAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.updateCardDetails.mockResolvedValue(undefined);
    h.createActivityEntry.mockResolvedValue({ id: "a", action: "UPDATED", createdAt: new Date() });
    expect(await updateCardDetailsAction(form())).toEqual({ success: true });
    expect(h.updateCardDetails).toHaveBeenCalled();
  });
});

describe("createCommentAction (viewer IS allowed to comment)", () => {
  const form = () => formData({ cardId: CARD_ID, content: "hello" });
  it("A1 auth", async () => {
    signOut();
    await expect(createCommentAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A3 isolation: WS-B viewer cannot comment on a WS-A card", async () => {
    // No A2 here — viewer is a *legitimate* commenter; the boundary that matters
    // for comments is workspace isolation, exercised by a non-member.
    signInAs("u", WS_B, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await createCommentAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A viewer can comment", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.createComment.mockResolvedValue({ id: "cm", content: "hello", createdAt: new Date(), updatedAt: null });
    h.createActivityEntry.mockResolvedValue({ id: "a", action: "COMMENTED", createdAt: new Date() });
    h.db.user.findUnique.mockResolvedValue({ name: "U", image: null });
    h.db.board.findUnique.mockResolvedValue({ title: "B" });
    expect(await createCommentAction(form())).toEqual({ success: true, commentId: "cm" });
    expect(h.createComment).toHaveBeenCalled();
  });
});

describe("uploadAttachmentAction (card:update)", () => {
  const file = () => new File(["x"], "a.png", { type: "image/png" });
  const form = () => {
    const fd = formData({ cardId: CARD_ID });
    fd.set("file", file());
    return fd;
  };
  it("A1 auth", async () => {
    signOut();
    await expect(uploadAttachmentAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
    expect(h.uploadToCloudinary).not.toHaveBeenCalled();
  });
  it("A2 viewer denied — no upload, no write", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await uploadAttachmentAction(form())).toEqual({ success: false, error: "Card not found" });
    expect(h.uploadToCloudinary).not.toHaveBeenCalled();
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied — no upload, no write", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await uploadAttachmentAction(form())).toEqual({ success: false, error: "Card not found" });
    expect(h.uploadToCloudinary).not.toHaveBeenCalled();
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches the attachment write", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.validateFileForUpload.mockReturnValue({ valid: true });
    h.uploadToCloudinary.mockResolvedValue({ secureUrl: "u", publicId: "p", resourceType: "image" });
    h.createAttachment.mockResolvedValue({ id: "att" });
    h.createActivityEntry.mockResolvedValue({ id: "a" });
    expect(await uploadAttachmentAction(form())).toEqual({ success: true, attachmentId: "att" });
    expect(h.createAttachment).toHaveBeenCalled();
  });
});

/* ─── Card member actions (card:update) ─────────────────────────────────── */

describe("assignCardMemberAction", () => {
  const form = () => formData({ cardId: CARD_ID, userId: "target-user" });
  it("A1 auth", async () => {
    signOut();
    await expect(assignCardMemberAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await assignCardMemberAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await assignCardMemberAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.db.workspaceMember.findFirst.mockResolvedValue({ id: "m" });
    h.db.$transaction.mockResolvedValue({ changed: false, member: { id: "x", name: "N", image: null, email: "e@x" } });
    await assignCardMemberAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

describe("removeCardMemberAction", () => {
  const form = () => formData({ cardId: CARD_ID, userId: "target-user" });
  it("A1 auth", async () => {
    signOut();
    await expect(removeCardMemberAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await removeCardMemberAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await removeCardMemberAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.db.$transaction.mockResolvedValue({ changed: false });
    await removeCardMemberAction(form());
    expect(h.db.$transaction).toHaveBeenCalled();
  });
});

/* ─── Label actions ─────────────────────────────────────────────────────── */

describe("createLabelAction (board:update)", () => {
  const form = () => formData({ boardId: BOARD_A, name: "Bug", color: COLOR });
  it("A1 auth", async () => {
    signOut();
    await expect(createLabelAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    expect(await createLabelAction(form())).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    expect(await createLabelAction(form())).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor", async () => {
    signInAs("u", WS_A, "editor");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    h.createLabel.mockResolvedValue({ id: "lab", boardId: BOARD_A, name: "Bug", color: COLOR });
    await createLabelAction(form());
    expect(h.createLabel).toHaveBeenCalled();
  });
});

describe("updateLabelAction (board:update)", () => {
  const form = () => formData({ labelId: LABEL_ID, name: "Bug", color: COLOR });
  it("A1 auth", async () => {
    signOut();
    await expect(updateLabelAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getLabelWithBoard.mockResolvedValue(labelWithBoardFixture(WS_A, { labelId: LABEL_ID }));
    expect(await updateLabelAction(form())).toEqual({ success: false, error: "Label not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getLabelWithBoard.mockResolvedValue(labelWithBoardFixture(WS_A, { labelId: LABEL_ID }));
    expect(await updateLabelAction(form())).toEqual({ success: false, error: "Label not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor", async () => {
    signInAs("u", WS_A, "editor");
    h.getLabelWithBoard.mockResolvedValue(labelWithBoardFixture(WS_A, { labelId: LABEL_ID }));
    h.updateLabel.mockResolvedValue({ id: LABEL_ID, boardId: BOARD_A, name: "Bug", color: COLOR });
    h.getCardIdsWithLabel.mockResolvedValue([]); // label-change fan-out (US-010): no cards to refresh here
    await updateLabelAction(form());
    expect(h.updateLabel).toHaveBeenCalled();
  });
});

describe("deleteLabelAction (board:update)", () => {
  const form = () => formData({ labelId: LABEL_ID });
  it("A1 auth", async () => {
    signOut();
    await expect(deleteLabelAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getLabelWithBoard.mockResolvedValue(labelWithBoardFixture(WS_A, { labelId: LABEL_ID }));
    expect(await deleteLabelAction(form())).toEqual({ success: false, error: "Label not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getLabelWithBoard.mockResolvedValue(labelWithBoardFixture(WS_A, { labelId: LABEL_ID }));
    expect(await deleteLabelAction(form())).toEqual({ success: false, error: "Label not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor", async () => {
    signInAs("u", WS_A, "editor");
    h.getLabelWithBoard.mockResolvedValue(labelWithBoardFixture(WS_A, { labelId: LABEL_ID }));
    h.getCardIdsWithLabel.mockResolvedValue([]); // captured before delete (US-010); none here
    h.deleteLabel.mockResolvedValue(undefined);
    await deleteLabelAction(form());
    expect(h.deleteLabel).toHaveBeenCalled();
  });
});

describe("addCardLabelAction (card:update)", () => {
  const form = () => formData({ cardId: CARD_ID, labelId: LABEL_ID });
  it("A1 auth", async () => {
    signOut();
    await expect(addCardLabelAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await addCardLabelAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await addCardLabelAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches the attach seam", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A, { boardId: BOARD_A }));
    h.getLabelWithBoard.mockResolvedValue(labelWithBoardFixture(WS_A, { boardId: BOARD_A, labelId: LABEL_ID }));
    h.addCardLabel.mockResolvedValue({ changed: true });
    h.getCardLabels.mockResolvedValue([]);
    await addCardLabelAction(form());
    expect(h.addCardLabel).toHaveBeenCalled();
  });
});

describe("removeCardLabelAction (card:update)", () => {
  const form = () => formData({ cardId: CARD_ID, labelId: LABEL_ID });
  it("A1 auth", async () => {
    signOut();
    await expect(removeCardLabelAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await removeCardLabelAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B editor denied", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    expect(await removeCardLabelAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches the detach seam", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A, { boardId: BOARD_A }));
    h.removeCardLabel.mockResolvedValue({ changed: true });
    h.getCardLabels.mockResolvedValue([]);
    await removeCardLabelAction(form());
    expect(h.removeCardLabel).toHaveBeenCalled();
  });
});
