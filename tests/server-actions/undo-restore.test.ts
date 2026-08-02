/**
 * US-083 W8 — undo restore Server Actions: the parent-list-archived
 * discrimination contract for `restoreCardAction` plus the restore-list path
 * the undo snackbar rides.
 *
 * Decision 0031 + locked W8 scope:
 *  - The dedicated "Restore the list first." outcome is surfaced ONLY when the
 *    card exists, remains archived, its parent list is archived, the board is
 *    active, AND the caller is authorized. Missing/foreign/already-restored/
 *    permanently-removed/archived-board callers keep the generic not-found
 *    contract — the discrimination must never leak existence.
 *  - The parent-list check is enforced INSIDE the restore transaction (FOR
 *    UPDATE lock + revalidation, repository pattern from US-074) so a
 *    concurrent list archival between the pre-read and the transaction can
 *    never commit a live card into an invisible list.
 *
 * Sabotage note: case "race" below turns RED if the in-transaction
 * revalidation branch is removed (the fake tx then reports an archived list
 * and the action would proceed to restore); the call-shape case pins the
 * FOR UPDATE lock acquisition.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cardWithListAndBoardFixture,
  expectNoWrites,
  formData,
  listWithBoardFixture,
  roleGrants,
  type Role,
} from "./_harness";

const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";
const BOARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CARD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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
    hasPermission: vi.fn(
      async ({ body }: { body: { organizationId: string; permissions: Record<string, string[]> } }) => ({
        success: checkRef.fn ? checkRef.fn(body.organizationId, body.permissions) : false,
      }),
    ),
    getArchivedCardWithListAndBoard: fn(),
    getArchivedListWithBoard: fn(),
    restoreList: fn(),
    db: {
      $transaction: vi.fn(),
    },
    emit: {
      emitCardCreated: vi.fn(),
      emitAnalyticsRefresh: vi.fn(),
      emitListRestored: vi.fn(),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/card", () => ({ getArchivedCardWithListAndBoard: h.getArchivedCardWithListAndBoard }));
vi.mock("@/lib/list", () => ({
  getArchivedListWithBoard: h.getArchivedListWithBoard,
  restoreList: h.restoreList,
}));
vi.mock("@/lib/realtime/server", () => ({ ...h.emit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  restoreCardAction,
  restoreListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";

const writeSeams = [
  h.db.$transaction,
  h.emit.emitCardCreated,
  h.emit.emitListRestored,
  h.emit.emitAnalyticsRefresh,
];

/**
 * Full-shape archived card fixture (mirrors `getArchivedCardWithListAndBoard`'s
 * W8 return: the existing record plus the `parentListArchived` discriminator).
 */
function archivedCardFixture(
  wsId: string,
  opts: { parentListArchived?: boolean; boardArchivedAt?: Date | null } = {},
) {
  return {
    ...cardWithListAndBoardFixture(wsId, { boardId: BOARD_A, cardId: CARD_ID, listId: LIST_ID }),
    card: {
      id: CARD_ID,
      listId: LIST_ID,
      title: "Archived Card",
      description: null,
      position: 16384,
      priority: null,
      dueDate: null,
      estimateHours: null,
      completedAt: null,
      deletedAt: null,
      coverImage: null,
      archivedAt: new Date(),
      createdById: "u-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    board: {
      id: BOARD_A,
      workspaceId: wsId,
      archivedAt: opts.boardArchivedAt ?? null,
    },
    parentListArchived: opts.parentListArchived ?? false,
  };
}

/**
 * A permissive in-memory `Prisma.TransactionClient` stand-in for the restore
 * transaction body (US-062 tg2 style): `$queryRaw` returns the parent list
 * row the test controls; `card.update` records its call.
 */
function makeTx(listRow: { id: string; archivedAt: Date | null } | null) {
  return {
    $queryRaw: vi.fn(async () => (listRow === null ? [] : [listRow])),
    card: {
      update: vi.fn(async () => ({
        id: CARD_ID,
        estimateHours: null,
        dueDate: null,
        members: [],
      })),
    },
    cardHistoryEvent: { createMany: vi.fn(async () => ({ count: 1 })) },
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

describe("restoreCardAction — W8 parent-list discrimination (no existence leak)", () => {
  const form = () => formData({ cardId: CARD_ID });

  it("A1 auth: signed out → throws, no write", async () => {
    signOut();
    await expect(restoreCardAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 viewer denied — even when the parent list IS archived (no leak)", async () => {
    signInAs("u", WS_A, "viewer");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(
      archivedCardFixture(WS_A, { parentListArchived: true }),
    );
    const r = await restoreCardAction(form());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 WS-B admin denied on a WS-A card — even when the parent list IS archived (no leak)", async () => {
    signInAs("u", WS_B, "admin");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(
      archivedCardFixture(WS_A, { parentListArchived: true }),
    );
    const r = await restoreCardAction(form());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("sequential case: card exists, is archived, parent list archived, authorized → dedicated message + code, no write", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(
      archivedCardFixture(WS_A, { parentListArchived: true }),
    );
    const r = await restoreCardAction(form());
    expect(r).toEqual({
      success: false,
      error: "Restore the list first.",
      code: "PARENT_LIST_ARCHIVED",
    });
    expectNoWrites(...writeSeams);
  });

  it("archived board wins over the parent-list message (generic not-found)", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(
      archivedCardFixture(WS_A, {
        parentListArchived: true,
        boardArchivedAt: new Date(),
      }),
    );
    const r = await restoreCardAction(form());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });

  it("missing/foreign/already-restored (resolver null) → generic not-found", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(null);
    const r = await restoreCardAction(form());
    expect(r).toEqual({ success: false, error: "Card not found" });
    expectNoWrites(...writeSeams);
  });

  it("race: parent list archived between pre-read and tx → in-tx revalidation aborts with the dedicated result, card.update never runs", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(archivedCardFixture(WS_A));
    const tx = makeTx({ id: LIST_ID, archivedAt: new Date() }); // archiver won the race
    h.db.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    const r = await restoreCardAction(form());

    expect(r).toEqual({
      success: false,
      error: "Restore the list first.",
      code: "PARENT_LIST_ARCHIVED",
    });
    // The restore write itself must never run after the revalidation failed.
    expect(tx.card.update).not.toHaveBeenCalled();
    expect(tx.cardHistoryEvent.createMany).not.toHaveBeenCalled();
    expectNoWrites(...Object.values(h.emit));
  });

  it("race: parent list row gone (permanently deleted mid-flight) → generic failure, no leak", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(archivedCardFixture(WS_A));
    const tx = makeTx(null); // the list row no longer exists
    h.db.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    const r = await restoreCardAction(form());

    expect(r).toEqual({ success: false, error: "Failed to restore card. Please try again." });
    expect(tx.card.update).not.toHaveBeenCalled();
    expectNoWrites(...Object.values(h.emit));
  });

  it("double-undo residual: card already restored inside the tx → generic failure contract (decision 0031)", async () => {
    signInAs("u", WS_A, "editor");
    h.getArchivedCardWithListAndBoard.mockResolvedValue(archivedCardFixture(WS_A));
    const tx = makeTx({ id: LIST_ID, archivedAt: null });
    tx.card.update.mockRejectedValue(Object.assign(new Error("P2025"), { code: "P2025" }));
    h.db.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    const r = await restoreCardAction(form());

    expect(r).toEqual({ success: false, error: "Failed to restore card. Please try again." });
    expectNoWrites(...Object.values(h.emit));
  });

  it("allow: clean restore locks the parent list FOR UPDATE, revalidates it active, restores, records CARD_RESTORED, emits card:created + analytics", async () => {
    signInAs("u", WS_A, "editor");
    const fixture = archivedCardFixture(WS_A);
    h.getArchivedCardWithListAndBoard.mockResolvedValue(fixture);
    const tx = makeTx({ id: LIST_ID, archivedAt: null });
    h.db.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    const r = await restoreCardAction(form());

    expect(r).toEqual({ success: true });
    // Lock + revalidation happen FIRST, inside the transaction (call-shape pin).
    const queryRawArgs = tx.$queryRaw.mock.calls[0];
    expect(queryRawArgs.some((a: unknown) => String(a).includes("FOR UPDATE"))).toBe(true);
    expect(queryRawArgs.some((a: unknown) => String(a).includes("archivedAt"))).toBe(true);
    expect(tx.card.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CARD_ID, archivedAt: { not: null } },
        data: { archivedAt: null },
      }),
    );
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalledTimes(1);
    expect(h.emit.emitCardCreated).toHaveBeenCalledWith(BOARD_A, expect.any(Object));
    expect(h.emit.emitAnalyticsRefresh).toHaveBeenCalledWith(WS_A);
  });
});

describe("restoreListAction — the undo-list path stays on the existing contract", () => {
  const form = () => formData({ listId: LIST_ID });

  it("A1 auth", async () => {
    signOut();
    await expect(restoreListAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("allow: editor restores the archived list → list:restored + analytics, no card writes", async () => {
    signInAs("u", WS_A, "editor");
    const fixture = listWithBoardFixture(WS_A);
    (fixture.list as { archivedAt: Date | null }).archivedAt = new Date();
    h.getArchivedListWithBoard.mockResolvedValue(fixture);
    h.restoreList.mockResolvedValue({
      id: LIST_ID,
      boardId: fixture.board.id,
      title: "Restored List",
      position: 16384,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const r = await restoreListAction(form());

    expect(r).toEqual({ success: true });
    expect(h.restoreList).toHaveBeenCalledWith(LIST_ID);
    expect(h.emit.emitListRestored).toHaveBeenCalledWith(fixture.board.id, {
      list: {
        id: LIST_ID,
        title: "Restored List",
        boardId: fixture.board.id,
        position: 16384,
      },
    });
    expect(h.emit.emitAnalyticsRefresh).toHaveBeenCalledWith(WS_A);
  });

  it("viewer denied → generic not-found (list undo rides the same gate)", async () => {
    signInAs("u", WS_A, "viewer");
    h.getArchivedListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A));
    const r = await restoreListAction(form());
    expect(r).toEqual({ success: false, error: "List not found" });
    expectNoWrites(...writeSeams);
  });
});
