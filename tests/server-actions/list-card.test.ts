/**
 * US-006 — Server Action security tests: list, card, comment, member & label
 * actions in `boards/[boardId]/actions.ts`.
 *
 * Same contract as board.test.ts: A1 (auth) / A2 (permission) / A3 (isolation)
 * + a positive control per action. The auth seam (`auth.api.hasPermission`) is
 * mocked one layer below `hasWorkspacePermission`, so the real resource→workspace
 * derivation runs.
 *
 * Positive controls assert the action *reached its write seam* once permission
 * is granted — proving denials aren't vacuous (an allowed caller really does
 * proceed to write). For actions whose write lives inside `db.$transaction`,
 * a representative set (createCard, deleteList, moveCard, assign/removeCardMember)
 * goes further: `$transaction` runs the real callback against a fake tx so the
 * transaction body (position math, multi-row writes) is exercised and its DB
 * effects are asserted — not merely that `$transaction` was called (US-062 tg2).
 * Reorder-lib seams (reorderCard/ListByNeighbors) stay mocked; their bodies are
 * unit-tested in lib/ordering.test.ts, lib/card.test.ts, lib/list.test.ts.
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
    getArchivedCardWithListAndBoard: fn(),
    getCardWithListAndMembers: fn(),
    getLabelWithBoard: fn(),
    getCardLabels: fn(),
    getCardIdsWithLabel: fn(),
    getCardMembers: fn(),
    // lib write seams
    createList: fn(),
    updateListTitle: fn(),
    reorderListByNeighbors: fn(),
    updateCardDetails: fn(),
    setCardCompletion: fn(),
    reorderCardWithinListByNeighbors: fn(),
    createComment: fn(),
    createAttachment: fn(),
    createActivityEntry: fn(),
    notifyMentioned: fn(),
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
      workspaceMember: { findFirst: vi.fn(), findMany: vi.fn() },
      notification: { create: vi.fn() },
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
      emitCardCompletionUpdated: fn(),
      emitCardLabelsUpdated: fn(),
      emitCardMembersUpdated: fn(),
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
  reorderListByNeighbors: h.reorderListByNeighbors,
}));
vi.mock("@/lib/card", () => ({
  getCardWithListAndBoard: h.getCardWithListAndBoard,
  getArchivedCardWithListAndBoard: h.getArchivedCardWithListAndBoard,
  getCardWithListAndMembers: h.getCardWithListAndMembers,
  updateCardDetails: h.updateCardDetails,
  setCardCompletion: h.setCardCompletion,
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
vi.mock("@/lib/card-member", () => ({ getCardMembers: h.getCardMembers }));
vi.mock("@/lib/comment", () => ({ createComment: h.createComment }));
vi.mock("@/lib/attachment", () => ({ createAttachment: h.createAttachment }));
vi.mock("@/lib/activity", () => ({ createActivityEntry: h.createActivityEntry }));
vi.mock("@/lib/notification", () => ({ notifyCardAssigned: vi.fn(), notifyCommentOnCard: vi.fn(), notifyMentioned: h.notifyMentioned }));
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
  toggleCardCompletionAction,
  deleteListAction,
  createCardAction,
  archiveCardAction,
  restoreCardAction,
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
  h.createList, h.updateListTitle, h.reorderListByNeighbors,
  h.updateCardDetails, h.setCardCompletion, h.reorderCardWithinListByNeighbors, h.createComment,
  h.createAttachment, h.createActivityEntry, h.createLabel, h.updateLabel,
  h.deleteLabel, h.addCardLabel, h.removeCardLabel,
  h.db.$transaction, h.db.card.update,
  ...Object.values(h.emit),
];

/**
 * A permissive in-memory `Prisma.TransactionClient` stand-in (tg2). Every method
 * an inline `db.$transaction` body calls is a spy with a sensible default so the
 * body runs to completion; individual tests assert on the relevant spy. Wire it
 * with `h.db.$transaction.mockImplementation((cb) => cb(tx))`.
 */
function makeTx() {
  return {
    card: {
      findMany: vi.fn(async () => [] as unknown[]),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "new-card",
        listId: data.listId,
        title: data.title,
        position: data.position,
        estimateHours: null,
        dueDate: null,
        completedAt: data.completedAt ?? null,
        archivedAt: null,
        deletedAt: null,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: CARD_ID,
        listId: data.listId ?? LIST_ID,
        position: typeof data.position === "number" ? data.position : 1,
        estimateHours: data.estimateHours ?? null,
        dueDate: data.dueDate ?? null,
        completedAt: data.completedAt ?? null,
      })),
    },
    list: { delete: vi.fn(async () => ({})) },
    cardReminder: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    cardMember: {
      findMany: vi.fn(async () => [] as unknown[]),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({
        user: { id: "target-user", name: "Target", image: null, email: "t@x.io" },
      })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: vi.fn(async () => ({ name: "Target" })) },
    activity: { create: vi.fn(async () => ({ id: "act" })) },
    cardHistoryEvent: { createMany: vi.fn(async () => ({ count: 0 })) },
    // Automation (US-066): the trigger tx bodies now evaluate rules. With no
    // enabled rules the evaluator is a no-op, so these positive controls still
    // assert only the pre-automation transaction seams.
    rule: { findMany: vi.fn(async () => [] as unknown[]) },
    ruleExecutionLog: { create: vi.fn(async () => ({ id: "log" })) },
  };
}

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
    h.createList.mockResolvedValue({ id: "l", boardId: BOARD_A, title: "List", position: 1 });
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

describe("toggleCardCompletionAction (card-owned completion — US-045)", () => {
  const form = (complete = "true") => formData({ cardId: CARD_ID, complete });

  it("A1 auth: signed out → throws, no write", async () => {
    signOut();
    await expect(toggleCardCompletionAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A, { cardId: CARD_ID }));
    expect(await toggleCardCompletionAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B editor cannot complete a WS-A card", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A, { cardId: CARD_ID }));
    expect(await toggleCardCompletionAction(form())).toEqual({ success: false, error: "Card not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("estimate gate: blocks completion when requireEstimateBeforeDone and no estimate", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A, { cardId: CARD_ID }));
    h.db.workspace.findUnique.mockResolvedValue({ requireEstimateBeforeDone: true });
    const r = await toggleCardCompletionAction(form("true"));
    expect(r).toEqual({ success: false, error: "Set an estimate before marking this card complete" });
    expectNoWrites(h.setCardCompletion, h.db.$transaction, ...Object.values(h.emit));
  });

  it("allow: editor completes → writes completion + CARD_COMPLETED, emits completion", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndMembers.mockResolvedValue(cardWithListAndMembersFixture(WS_A, { cardId: CARD_ID }));
    h.db.workspace.findUnique.mockResolvedValue({ requireEstimateBeforeDone: false });
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));
    const completedAt = new Date("2026-07-03T00:00:00.000Z");
    h.setCardCompletion.mockResolvedValue({
      card: {
        id: CARD_ID, listId: LIST_ID, title: "Card", description: null, position: 1,
        priority: null, dueDate: null, estimateHours: null, completedAt,
        deletedAt: null, coverImage: null, archivedAt: null, createdById: "u",
        createdAt: completedAt, updatedAt: completedAt,
      },
      transitioned: true,
    });

    const r = await toggleCardCompletionAction(form("true"));

    expect(r.success).toBe(true);
    expect(h.setCardCompletion).toHaveBeenCalledWith(tx, CARD_ID, true, null);
    // A real transition records exactly one history event...
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalledTimes(1);
    // ...and broadcasts the completion flip (carrying completedAt, not a boolean).
    expect(h.emit.emitCardCompletionUpdated).toHaveBeenCalledWith(
      "board-1",
      { cardId: CARD_ID, completedAt: completedAt.toISOString() },
    );
  });

  it("no-op: re-completing an already-complete card succeeds, writes no event, still emits state", async () => {
    signInAs("u", WS_A, "editor");
    const already = new Date("2026-07-01T00:00:00.000Z");
    const fx = cardWithListAndMembersFixture(WS_A, { cardId: CARD_ID });
    fx.card.completedAt = already;
    h.getCardWithListAndMembers.mockResolvedValue(fx);
    // requireEstimateBeforeDone must NOT block a no-op (it isn't a transition) —
    // decision 0021's "at most one completion per streak" leans on this guard.
    h.db.workspace.findUnique.mockResolvedValue({ requireEstimateBeforeDone: true });
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));
    h.setCardCompletion.mockResolvedValue({
      card: {
        id: CARD_ID, listId: LIST_ID, title: "Card", description: null, position: 1,
        priority: null, dueDate: null, estimateHours: null, completedAt: already,
        deletedAt: null, coverImage: null, archivedAt: null, createdById: "u",
        createdAt: already, updatedAt: already,
      },
      transitioned: false,
    });

    const r = await toggleCardCompletionAction(form("true"));

    expect(r.success).toBe(true);
    // No transition → no history event, and the estimate gate never fired.
    expect(tx.cardHistoryEvent.createMany).not.toHaveBeenCalled();
    expect(h.emit.emitCardCompletionUpdated).toHaveBeenCalledWith(
      "board-1",
      { cardId: CARD_ID, completedAt: already.toISOString() },
    );
  });

  it("allow: editor reopens a complete card → writes CARD_REOPENED, emits completedAt null", async () => {
    signInAs("u", WS_A, "editor");
    const already = new Date("2026-07-01T00:00:00.000Z");
    const fx = cardWithListAndMembersFixture(WS_A, { cardId: CARD_ID });
    fx.card.completedAt = already;
    h.getCardWithListAndMembers.mockResolvedValue(fx);
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));
    h.setCardCompletion.mockResolvedValue({
      card: {
        id: CARD_ID, listId: LIST_ID, title: "Card", description: null, position: 1,
        priority: null, dueDate: null, estimateHours: null, completedAt: null,
        deletedAt: null, coverImage: null, archivedAt: null, createdById: "u",
        createdAt: already, updatedAt: already,
      },
      transitioned: true,
    });

    const r = await toggleCardCompletionAction(form("false"));

    expect(r.success).toBe(true);
    expect(h.setCardCompletion).toHaveBeenCalledWith(tx, CARD_ID, false, already);
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalledTimes(1);
    expect(h.emit.emitCardCompletionUpdated).toHaveBeenCalledWith(
      "board-1",
      { cardId: CARD_ID, completedAt: null },
    );
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
  it("allow: WS-A editor — transaction body deletes the list", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    expect(await deleteListAction(form())).toEqual({ success: true });
    // The body ran end-to-end and issued the delete on the right list.
    expect(tx.list.delete).toHaveBeenCalledWith({ where: { id: LIST_ID } });
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
  it("allow: WS-A editor — transaction body creates the card at a gap position", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const r = await createCardAction(form());
    expect(r).toEqual({ success: true, cardId: "new-card" });
    // The body ran: it read the last card (none) and inserted at the first gap.
    expect(tx.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listId: LIST_ID, title: "Card", position: 16384 }),
      }),
    );
    // Creation history was captured in the same transaction.
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalled();
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

describe("restoreCardAction (card:delete)", () => {
  const form = () => formData({ cardId: CARD_ID });
  // Resolver requires an archived card; mirror cardWithListAndBoardFixture shape.
  const archivedFixture = (ws: string) => cardWithListAndBoardFixture(ws);
  it("A1 auth", async () => {
    signOut();
    await expect(restoreCardAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });
  it("A2 viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(archivedFixture(WS_A));
    expect(await restoreCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("A3 WS-B admin denied", async () => {
    signInAs("u", WS_B, "admin");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(archivedFixture(WS_A));
    expect(await restoreCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("guard: archived board → not found, no write", async () => {
    signInAs("u", WS_A, "editor");
    const fixture = archivedFixture(WS_A);
    h.getArchivedCardWithListAndBoard.mockResolvedValue({
      ...fixture,
      board: { ...fixture.board, archivedAt: new Date() },
    });
    expect(await restoreCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("guard: not-archived/foreign id (resolver null) → not found, no write", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(null);
    expect(await restoreCardAction(form())).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });
  it("allow: WS-A editor reaches $transaction", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(archivedFixture(WS_A));
    await restoreCardAction(form());
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

  it("allow: WS-A editor, same board → transaction body relocates the card to the target list", async () => {
    signInAs("u", WS_A, "editor");
    sameBoardSetup();
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    expect(await moveCardAction(form())).toEqual({ success: true });
    // The body ran the real position resolver (no neighbours → append) and wrote
    // the card into the target list at a concrete numeric position.
    expect(tx.card.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: CARD_ID }),
        data: expect.objectContaining({ listId: TARGET_LIST, position: 16384 }),
      }),
    );
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalled();
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

  it("calls notifyMentioned with @mention content", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.createComment.mockResolvedValue({ id: "cm", content: "@alice hello", createdAt: new Date(), updatedAt: null });
    h.createActivityEntry.mockResolvedValue({ id: "a", action: "COMMENTED", createdAt: new Date() });
    h.db.user.findUnique.mockResolvedValue({ name: "U", image: null });
    h.db.board.findUnique.mockResolvedValue({ title: "B" });
    expect(await createCommentAction(formData({ cardId: CARD_ID, content: "@alice hello" }))).toEqual({ success: true, commentId: "cm" });
    expect(h.notifyMentioned).toHaveBeenCalled();
    const callArg = h.notifyMentioned.mock.calls[0][0];
    expect(callArg.content).toBe("@alice hello");
    expect(callArg.cardId).toBe(CARD_ID);
    expect(callArg.workspaceId).toBe(WS_A);
  });

  it("calls notifyMentioned without mention content (no-op)", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.createComment.mockResolvedValue({ id: "cm", content: "plain text", createdAt: new Date(), updatedAt: null });
    h.createActivityEntry.mockResolvedValue({ id: "a", action: "COMMENTED", createdAt: new Date() });
    h.db.user.findUnique.mockResolvedValue({ name: "U", image: null });
    h.db.board.findUnique.mockResolvedValue({ title: "B" });
    expect(await createCommentAction(formData({ cardId: CARD_ID, content: "plain text" }))).toEqual({ success: true, commentId: "cm" });
    expect(h.notifyMentioned).toHaveBeenCalledWith(
      expect.objectContaining({ content: "plain text", cardId: CARD_ID }),
    );
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
  it("allow: WS-A editor — transaction body creates the card-member assignment", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.db.workspaceMember.findFirst.mockResolvedValue({ id: "m" });
    const tx = makeTx(); // cardMember.findUnique → null (not yet assigned) → create path
    h.getCardMembers.mockResolvedValue([]); // live-broadcast fan-out after commit
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const r = await assignCardMemberAction(form());
    expect(r).toEqual(
      expect.objectContaining({ success: true, changed: true }),
    );
    expect(tx.cardMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cardId: CARD_ID, userId: "target-user" }),
      }),
    );
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalled();
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
  it("allow: WS-A editor — transaction body deletes the card-member assignment", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    const tx = makeTx(); // cardMember.deleteMany → { count: 1 } → removed path
    h.getCardMembers.mockResolvedValue([]); // live-broadcast fan-out after commit
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    const r = await removeCardMemberAction(form());
    expect(r).toEqual(expect.objectContaining({ success: true, changed: true }));
    expect(tx.cardMember.deleteMany).toHaveBeenCalledWith({
      where: { cardId: CARD_ID, userId: "target-user" },
    });
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalled();
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
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
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
