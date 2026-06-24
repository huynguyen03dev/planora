/**
 * US-015 — Server Action security boundary for checklist mutations.
 *
 * Same A1/A2/A3 + positive-control shape as the US-006 suite (see _harness.ts):
 *  A1 auth — signed out → throws, no write seam touched.
 *  A2 permission — viewer denied (checklists reuse card:["update"]).
 *  A3 isolation — a member of WS-B cannot mutate a checklist owned by WS-A; the
 *     permission check is made against the resource's REAL workspace (WS-A).
 *  allow — an editor of the owning workspace reaches the write seam.
 *
 * The mocked auth seam delegates to roleGrants(), so the REAL
 * hasWorkspacePermission (and its resource-derived workspaceId) runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cardWithListAndBoardFixture,
  expectNoWrites,
  formData,
  roleGrants,
  type Role,
} from "./_harness";

const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";
const BOARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CHECKLIST_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";

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
    getCardWithListAndBoard: fn(),
    getChecklistWithCard: fn(),
    getChecklistItemWithCard: fn(),
    // write seams
    createChecklist: fn(),
    deleteChecklist: fn(),
    createChecklistItem: fn(),
    setChecklistItemCompleted: fn(),
    deleteChecklistItem: fn(),
    createActivityEntry: fn(),
    db: {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn() },
      board: { findUnique: vi.fn() },
    },
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
      emitCardMembersUpdated: fn(),
      emitCommentCreated: fn(),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/card", () => ({
  getCardWithListAndBoard: h.getCardWithListAndBoard,
  getCardWithListAndMembers: vi.fn(),
  updateCardDetails: vi.fn(),
  reorderCardWithinListByNeighbors: vi.fn(),
}));
vi.mock("@/lib/checklist", () => ({
  getChecklistWithCard: h.getChecklistWithCard,
  getChecklistItemWithCard: h.getChecklistItemWithCard,
  createChecklist: h.createChecklist,
  deleteChecklist: h.deleteChecklist,
  createChecklistItem: h.createChecklistItem,
  setChecklistItemCompleted: h.setChecklistItemCompleted,
  deleteChecklistItem: h.deleteChecklistItem,
}));
vi.mock("@/lib/activity", () => ({ createActivityEntry: h.createActivityEntry }));
vi.mock("@/lib/realtime/server", () => ({ ...h.emit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  createChecklistAction,
  deleteChecklistAction,
  createChecklistItemAction,
  toggleChecklistItemAction,
  deleteChecklistItemAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";

const writeSeams = [
  h.createChecklist, h.deleteChecklist, h.createChecklistItem,
  h.setChecklistItemCompleted, h.deleteChecklistItem, h.createActivityEntry,
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

/** ChecklistScopeRecord shape from getChecklistWithCard. */
function checklistScope(workspaceId: string, opts: { cardArchived?: boolean } = {}) {
  return {
    id: CHECKLIST_ID,
    cardId: CARD_ID,
    boardId: BOARD_A,
    cardArchived: opts.cardArchived ?? false,
    board: { id: BOARD_A, workspaceId, archivedAt: null },
  };
}
/** getChecklistItemWithCard adds itemId/checklistId to the scope. */
function itemScope(workspaceId: string) {
  return { ...checklistScope(workspaceId), itemId: ITEM_ID, checklistId: CHECKLIST_ID };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  h.state.membership.clear();
});

describe("createChecklistAction (card:update)", () => {
  const form = () => formData({ cardId: CARD_ID, title: "Acceptance" });

  it("A1 auth: signed out → throws, no write", async () => {
    signOut();
    await expect(createChecklistAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    const r = await createChecklistAction(form());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B editor cannot add a checklist to a WS-A card", async () => {
    signInAs("u", WS_B, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    const r = await createChecklistAction(form());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor reaches the write seam", async () => {
    signInAs("u", WS_A, "editor");
    h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
    h.createChecklist.mockResolvedValue({ id: CHECKLIST_ID, cardId: CARD_ID, title: "Acceptance", position: 16384, items: [] });
    const r = await createChecklistAction(form());
    expect(r).toEqual({ success: true, checklist: expect.objectContaining({ id: CHECKLIST_ID }) });
    expect(h.createChecklist).toHaveBeenCalledWith({ cardId: CARD_ID, title: "Acceptance" });
  });
});

describe("deleteChecklistAction (card:update)", () => {
  const form = () => formData({ checklistId: CHECKLIST_ID });

  it("A1 auth", async () => {
    signOut();
    await expect(deleteChecklistAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getChecklistWithCard.mockResolvedValue(checklistScope(WS_A));
    const r = await deleteChecklistAction(form());
    expect(r).toEqual({ success: false, error: "Checklist not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B editor cannot delete a WS-A checklist", async () => {
    signInAs("u", WS_B, "editor");
    h.getChecklistWithCard.mockResolvedValue(checklistScope(WS_A));
    const r = await deleteChecklistAction(form());
    expect(r).toEqual({ success: false, error: "Checklist not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor reaches the write seam", async () => {
    signInAs("u", WS_A, "editor");
    h.getChecklistWithCard.mockResolvedValue(checklistScope(WS_A));
    const r = await deleteChecklistAction(form());
    expect(r).toEqual({ success: true });
    expect(h.deleteChecklist).toHaveBeenCalledWith(CHECKLIST_ID);
  });
});

describe("createChecklistItemAction (card:update)", () => {
  const form = () => formData({ checklistId: CHECKLIST_ID, title: "Write tests" });

  it("A1 auth", async () => {
    signOut();
    await expect(createChecklistItemAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getChecklistWithCard.mockResolvedValue(checklistScope(WS_A));
    const r = await createChecklistItemAction(form());
    expect(r).toEqual({ success: false, error: "Checklist not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B editor cannot add an item to a WS-A checklist", async () => {
    signInAs("u", WS_B, "editor");
    h.getChecklistWithCard.mockResolvedValue(checklistScope(WS_A));
    const r = await createChecklistItemAction(form());
    expect(r).toEqual({ success: false, error: "Checklist not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor reaches the write seam", async () => {
    signInAs("u", WS_A, "editor");
    h.getChecklistWithCard.mockResolvedValue(checklistScope(WS_A));
    h.createChecklistItem.mockResolvedValue({ id: ITEM_ID, checklistId: CHECKLIST_ID, title: "Write tests", isCompleted: false, position: 16384 });
    const r = await createChecklistItemAction(form());
    expect(r).toEqual({ success: true, item: expect.objectContaining({ id: ITEM_ID }) });
    expect(h.createChecklistItem).toHaveBeenCalledWith({ checklistId: CHECKLIST_ID, title: "Write tests" });
  });
});

describe("toggleChecklistItemAction (card:update)", () => {
  const form = () => formData({ itemId: ITEM_ID, isCompleted: "true" });

  it("A1 auth", async () => {
    signOut();
    await expect(toggleChecklistItemAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getChecklistItemWithCard.mockResolvedValue(itemScope(WS_A));
    const r = await toggleChecklistItemAction(form());
    expect(r).toEqual({ success: false, error: "Item not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B editor cannot toggle a WS-A item", async () => {
    signInAs("u", WS_B, "editor");
    h.getChecklistItemWithCard.mockResolvedValue(itemScope(WS_A));
    const r = await toggleChecklistItemAction(form());
    expect(r).toEqual({ success: false, error: "Item not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor reaches the write seam, coercing isCompleted", async () => {
    signInAs("u", WS_A, "editor");
    h.getChecklistItemWithCard.mockResolvedValue(itemScope(WS_A));
    h.setChecklistItemCompleted.mockResolvedValue({ id: ITEM_ID, checklistId: CHECKLIST_ID, title: "x", isCompleted: true, position: 16384 });
    const r = await toggleChecklistItemAction(form());
    expect(r).toEqual({ success: true, item: expect.objectContaining({ isCompleted: true }) });
    expect(h.setChecklistItemCompleted).toHaveBeenCalledWith(ITEM_ID, true);
  });
});

describe("deleteChecklistItemAction (card:update)", () => {
  const form = () => formData({ itemId: ITEM_ID });

  it("A1 auth", async () => {
    signOut();
    await expect(deleteChecklistItemAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.getChecklistItemWithCard.mockResolvedValue(itemScope(WS_A));
    const r = await deleteChecklistItemAction(form());
    expect(r).toEqual({ success: false, error: "Item not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B editor cannot delete a WS-A item", async () => {
    signInAs("u", WS_B, "editor");
    h.getChecklistItemWithCard.mockResolvedValue(itemScope(WS_A));
    const r = await deleteChecklistItemAction(form());
    expect(r).toEqual({ success: false, error: "Item not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor reaches the write seam", async () => {
    signInAs("u", WS_A, "editor");
    h.getChecklistItemWithCard.mockResolvedValue(itemScope(WS_A));
    const r = await deleteChecklistItemAction(form());
    expect(r).toEqual({ success: true });
    expect(h.deleteChecklistItem).toHaveBeenCalledWith(ITEM_ID);
  });
});

describe("archived guards", () => {
  it("rejects when the owning board is archived", async () => {
    signInAs("u", WS_A, "editor");
    h.getChecklistWithCard.mockResolvedValue({
      ...checklistScope(WS_A),
      board: { id: BOARD_A, workspaceId: WS_A, archivedAt: new Date() },
    });
    const r = await deleteChecklistAction(formData({ checklistId: CHECKLIST_ID }));
    expect(r).toEqual({ success: false, error: "Checklist not found" });
    expectNoWrites(...writeSeams);
  });

  it("rejects when the owning card is archived", async () => {
    signInAs("u", WS_A, "editor");
    h.getChecklistItemWithCard.mockResolvedValue({ ...itemScope(WS_A), cardArchived: true });
    const r = await toggleChecklistItemAction(formData({ itemId: ITEM_ID, isCompleted: "false" }));
    expect(r).toEqual({ success: false, error: "Item not found" });
    expectNoWrites(...writeSeams);
  });
});
