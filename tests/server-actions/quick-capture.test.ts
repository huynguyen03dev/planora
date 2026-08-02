/**
 * US-083 W7 — global quick capture integration.
 *
 * Two contracts, one file:
 *
 * 1. `getQuickCaptureOptionsAction` (the one new read-only authenticated
 *    Server Action): scope is derived server-side from the session user's
 *    `WorkspaceMember` rows — never client-supplied. Only editor/admin
 *    (creatable) memberships are returned, with active boards and active
 *    lists only, in a deterministic membership/board order, via exactly four
 *    bounded queries (no N+1).
 *
 * 2. `createCardAction` extended backward-compatibly (US-078 AC4/AC5/AC6):
 *    the optional description / due date / priority persist in the SAME
 *    transaction as the title+position create (no chained update actions,
 *    no wrapper mutation), with the existing auth/permission obfuscation
 *    ("List not found"), archived-board denial, position gap math, history,
 *    revalidation, and emits preserved — and the `card:created` payload
 *    carries dueDate/priority fidelity for observer clients.
 *
 * Same harness contract as list-card.test.ts: the auth seam
 * (`auth.api.hasPermission`) is mocked one layer below
 * `hasWorkspacePermission`, so the real resource→workspace derivation runs;
 * `$transaction` runs the real callback against a fake tx (US-062 tg2) so
 * the transaction body (position math, single create) is exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formData, listWithBoardFixture, roleGrants, type Role } from "./_harness";

const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";
const BOARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIST_A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const LIST_A2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
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
    hasPermission: vi.fn(async ({ body }: { body: { organizationId: string; permissions: Record<string, string[]> } }) => ({
      success: checkRef.fn ? checkRef.fn(body.organizationId, body.permissions) : false,
    })),
    // options-action query seams (bounded read model)
    db: {
      workspaceMember: { findMany: vi.fn() },
      workspace: { findMany: vi.fn() },
      board: { findMany: vi.fn() },
      list: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    // createCardAction loader seam
    getListWithBoard: fn(),
    // restoreCardAction loader seam (archived-aware resolver)
    getArchivedCardWithListAndBoard: fn(),
    // realtime emitters
    emit: {
      emitCardCreated: fn(),
      emitAnalyticsRefresh: fn(),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/list", () => ({ getListWithBoard: h.getListWithBoard }));
// Only the archived-aware resolver is needed by the actions under test; the
// rest of @/lib/card exports stay undefined (never called in these paths).
vi.mock("@/lib/card", () => ({
  getArchivedCardWithListAndBoard: h.getArchivedCardWithListAndBoard,
}));
vi.mock("@/lib/realtime/server", () => ({ ...h.emit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  getQuickCaptureOptionsAction,
} from "@/app/(authenticated)/actions";
import { createCardAction, restoreCardAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { revalidatePath } from "next/cache";

/**
 * A permissive in-memory `Prisma.TransactionClient` stand-in (tg2). The
 * createCard body needs: last-card read (findFirst), the create itself,
 * history (cardHistoryEvent.createMany), and the automation evaluator's
 * rule read. The create returns the fields the action selects, including the
 * W7-fidelity fields (dueDate/priority) so the emit payload is asserted.
 */
function makeTx() {
  return {
    $queryRaw: vi.fn(async () => [{ id: LIST_A1, archivedAt: null }]),
    card: {
      findFirst: vi.fn(async (): Promise<{ position: number } | null> => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: CARD_ID,
        listId: data.listId,
        title: data.title,
        position: data.position,
        estimateHours: null,
        dueDate: data.dueDate ?? null,
        priority: data.priority ?? null,
        archivedAt: null,
        deletedAt: null,
      })),
      // restoreCardAction's tx.update — returns what buildCardRestoredEvent
      // reads (id/estimateHours/dueDate/members).
      update: vi.fn(async () => ({
        id: CARD_ID,
        estimateHours: null,
        dueDate: null,
        members: [],
      })),
    },
    cardMember: { findMany: vi.fn(async () => [] as unknown[]) },
    cardHistoryEvent: { createMany: vi.fn(async () => ({ count: 0 })) },
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

/* ─── getQuickCaptureOptionsAction — membership/role isolation ─────────── */

describe("getQuickCaptureOptionsAction (US-083 W7 options action)", () => {
  const membership = (organizationId: string, role: string) => ({
    organizationId,
    role,
    createdAt: new Date("2026-08-01T00:00:00Z"),
  });
  const workspace = (id: string, name: string) => ({
    id,
    name,
    createdAt: new Date("2026-08-01T00:00:00Z"),
  });
  const board = (id: string, title: string, workspaceId: string) => ({
    id,
    title,
    workspaceId,
    createdAt: new Date("2026-08-01T00:00:00Z"),
  });
  const list = (id: string, title: string, boardId: string) => ({
    id,
    title,
    boardId,
    position: 16384,
  });

  it("A1 auth: signed out → throws, no db reads", async () => {
    signOut();
    await expect(getQuickCaptureOptionsAction()).rejects.toThrow();
    expect(h.db.workspaceMember.findMany).not.toHaveBeenCalled();
    expect(h.db.workspace.findMany).not.toHaveBeenCalled();
  });

  it("returns only editor/admin memberships — viewer memberships are never creatable scope", async () => {
    signInAs("u", WS_A, "viewer");
    // The query filters roles itself — the viewer membership never reaches
    // the read model (the mock simulates the DB's role filter).
    h.db.workspaceMember.findMany.mockResolvedValue([]);

    const result = await getQuickCaptureOptionsAction();

    expect(result).toEqual({ workspaces: [] });
    expect(h.db.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u",
          role: { in: ["admin", "editor"] },
        }),
      }),
    );
    expect(h.db.workspace.findMany).not.toHaveBeenCalled();
  });

  it("excludes a viewer-only workspace while keeping an editor workspace (mixed roles)", async () => {
    signInAs("u", WS_A, "editor");
    // The DB role filter only ever returns the editor membership; the query
    // shape below is the assertion that viewer memberships are out of scope.
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A, "editor")]);
    h.db.workspace.findMany.mockResolvedValue([workspace(WS_A, "Acme")]);
    h.db.board.findMany.mockResolvedValue([board(BOARD_A, "Roadmap", WS_A)]);
    h.db.list.findMany.mockResolvedValue([list(LIST_A1, "To Do", BOARD_A)]);

    const result = await getQuickCaptureOptionsAction();

    expect(result.workspaces.map((ws) => ws.id)).toEqual([WS_A]);
    // The viewer workspace is out of every query's scope.
    expect(h.db.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: { in: [WS_A] } }),
      }),
    );
  });

  it("scopes boards to active boards and lists to active lists only (no archived rows)", async () => {
    signInAs("u", WS_A, "admin");
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A, "admin")]);
    h.db.workspace.findMany.mockResolvedValue([workspace(WS_A, "Acme")]);
    h.db.board.findMany.mockResolvedValue([board(BOARD_A, "Roadmap", WS_A)]);
    h.db.list.findMany.mockResolvedValue([list(LIST_A1, "To Do", BOARD_A)]);

    await getQuickCaptureOptionsAction();

    expect(h.db.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: { in: [WS_A] },
          archivedAt: null,
        }),
      }),
    );
    expect(h.db.list.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          board: { workspaceId: { in: [WS_A] }, archivedAt: null },
          archivedAt: null,
        }),
      }),
    );
  });

  it("is deterministic: memberships by createdAt, boards by createdAt, lists by position", async () => {
    signInAs("u", WS_A, "admin");
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A, "admin")]);
    h.db.workspace.findMany.mockResolvedValue([workspace(WS_A, "Acme")]);
    h.db.board.findMany.mockResolvedValue([board(BOARD_A, "Roadmap", WS_A)]);
    h.db.list.findMany.mockResolvedValue([list(LIST_A1, "To Do", BOARD_A)]);

    await getQuickCaptureOptionsAction();

    expect(h.db.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([expect.objectContaining({ createdAt: "asc" })]),
      }),
    );
    expect(h.db.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([expect.objectContaining({ createdAt: "asc" })]),
      }),
    );
    expect(h.db.list.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([expect.objectContaining({ position: "asc" })]),
      }),
    );
  });

  it("groups boards under workspaces with their lists — exactly four bounded queries, no N+1", async () => {
    signInAs("u", WS_A, "editor");
    h.db.workspaceMember.findMany.mockResolvedValue([
      membership(WS_A, "editor"),
      membership(WS_B, "admin"),
    ]);
    h.db.workspace.findMany.mockResolvedValue([
      workspace(WS_B, "Globex"),
      workspace(WS_A, "Acme"),
    ]);
    h.db.board.findMany.mockResolvedValue([
      board(BOARD_A, "Roadmap", WS_A),
    ]);
    h.db.list.findMany.mockResolvedValue([
      list(LIST_A1, "To Do", BOARD_A),
      list(LIST_A2, "Done", BOARD_A),
    ]);

    const result = await getQuickCaptureOptionsAction();

    // Workspaces follow MEMBERSHIP order (Acme joined first), not the
    // workspace query's own order — deterministic membership order.
    expect(result.workspaces.map((ws) => ws.id)).toEqual([WS_A, WS_B]);
    expect(result.workspaces[0].boards).toEqual([
      {
        id: BOARD_A,
        title: "Roadmap",
        lists: [
          { id: LIST_A1, title: "To Do" },
          { id: LIST_A2, title: "Done" },
        ],
      },
    ]);
    expect(result.workspaces[1].boards).toEqual([]);

    // No N+1: one query per relation, exactly.
    expect(h.db.workspaceMember.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.workspace.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.board.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.list.findMany).toHaveBeenCalledTimes(1);
    // Bounded selects only — never whole rows.
    expect(h.db.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ organizationId: true }),
      }),
    );
    expect(h.db.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ id: true, name: true }) }),
    );
    expect(h.db.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true, title: true, workspaceId: true }),
      }),
    );
    expect(h.db.list.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true, title: true, boardId: true }),
      }),
    );
  });
});

/* ─── createCardAction — US-078 AC4/AC5/AC6 extended contract ──────────── */

describe("createCardAction extended for quick capture (US-083 W7)", () => {
  const form = () => formData({ listId: LIST_A1, title: "Card" });

  it("A1 auth: signed out → throws, no write (regression)", async () => {
    signOut();
    await expect(createCardAction(form())).rejects.toThrow();
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("A2 permission: viewer denied with the obfuscated error, no write (regression)", async () => {
    signInAs("u", WS_A, "viewer");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    expect(await createCardAction(form())).toEqual({ success: false, error: "List not found" });
    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.emit.emitCardCreated).not.toHaveBeenCalled();
  });

  it("A3 isolation: a foreign-workspace editor cannot create (regression)", async () => {
    signInAs("u", WS_B, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    expect(await createCardAction(form())).toEqual({ success: false, error: "List not found" });
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("archived board: denied before any write (regression guard)", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue({
      ...listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }),
      board: { id: BOARD_A, workspaceId: WS_A, archivedAt: new Date() },
    });
    expect(await createCardAction(form())).toEqual({ success: false, error: "List not found" });
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("AC4+AC5: optional description/dueDate/priority persist in ONE card.create — no chained updates", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await createCardAction(
      formData({
        listId: LIST_A1,
        title: "Captured task",
        description: "Notes from the quick capture dialog",
        dueDate: "2026-08-15",
        priority: "URGENT",
      }),
    );

    expect(result).toEqual({ success: true, cardId: CARD_ID });
    expect(tx.card.create).toHaveBeenCalledTimes(1);
    expect(tx.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listId: LIST_A1,
          title: "Captured task",
          position: 16384,
          description: "Notes from the quick capture dialog",
          dueDate: new Date("2026-08-15"),
          priority: "URGENT",
        }),
      }),
    );
    // One atomic create — the optional fields never ride a second mutation.
    expect(tx.card.update).not.toHaveBeenCalled();
    // History captured in the same transaction — payload PINNED, not merely
    // "createMany called": the CARD_CREATED row carries the workspace/board/
    // card ids and the W7-fidelity metadata (dueDate rides the event).
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workspaceId: WS_A,
          boardId: BOARD_A,
          cardId: CARD_ID,
          eventType: "CARD_CREATED",
          metadata: expect.objectContaining({
            dueDate: "2026-08-15T00:00:00.000Z",
          }),
        }),
      ],
      skipDuplicates: false,
    });
  });

  it("preserves automation evaluation INSIDE the create transaction (US-066 — W7 load-bearing)", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await createCardAction(form());

    // The REAL evaluator runs against the SAME tx: the card-created rule
    // lookup scoped to the workspace, enabled only, board-scoped. The W7
    // extension must never bypass the automation path.
    expect(tx.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS_A,
          triggerType: "card-created",
          enabled: true,
        }),
      }),
    );
  });

  it("maps empty-string optionals to null (description '', dueDate '', priority NONE)", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await createCardAction(
      formData({ listId: LIST_A1, title: "Bare card", description: "", dueDate: "", priority: "NONE" }),
    );

    expect(tx.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null, dueDate: null, priority: null }),
      }),
    );
  });

  it("rejects an invalid priority / invalid due date at the schema boundary — no writes", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));

    const badPriority = await createCardAction(
      formData({ listId: LIST_A1, title: "Card", priority: "CRITICAL" }),
    );
    expect(badPriority.success).toBe(false);
    expect(h.db.$transaction).not.toHaveBeenCalled();

    const badDate = await createCardAction(
      formData({ listId: LIST_A1, title: "Card", dueDate: "not-a-date" }),
    );
    expect(badDate.success).toBe(false);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("AC5 regression: position math preserved — appends at last position + gap", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    const tx = makeTx();
    tx.card.findFirst.mockResolvedValue({ position: 16384 });
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await createCardAction(form());

    expect(tx.card.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ listId: LIST_A1 }) }),
    );
    expect(tx.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 32768 }),
      }),
    );
  });

  it("AC6: emits card:created with dueDate/priority fidelity and revalidates the board path", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    await createCardAction(
      formData({ listId: LIST_A1, title: "Due card", dueDate: "2026-08-15", priority: "HIGH" }),
    );

    expect(h.emit.emitCardCreated).toHaveBeenCalledWith(BOARD_A, {
      card: expect.objectContaining({
        id: CARD_ID,
        listId: LIST_A1,
        title: "Due card",
        position: 16384,
        dueDate: "2026-08-15T00:00:00.000Z",
        priority: "HIGH",
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/boards/${BOARD_A}`);
    expect(h.emit.emitAnalyticsRefresh).toHaveBeenCalledWith(WS_A);
  });

  it("bare title-only create still succeeds with null optionals (backward compatibility)", async () => {
    signInAs("u", WS_A, "editor");
    h.getListWithBoard.mockResolvedValue(listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_A1 }));
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await createCardAction(form());

    expect(result).toEqual({ success: true, cardId: CARD_ID });
    expect(tx.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: null,
          dueDate: null,
          priority: null,
        }),
      }),
    );
    expect(h.emit.emitCardCreated).toHaveBeenCalledWith(BOARD_A, {
      card: expect.objectContaining({
        dueDate: null,
        priority: null,
      }),
    });
  });

  it("restoreCardAction emits card:created with dueDate/priority fidelity like create (W7 correction)", async () => {
    signInAs("u", WS_A, "editor");
    // Archived-aware resolver returns a restored card WITH its meta — the
    // emit must carry it, exactly like createCardAction's.
    h.getArchivedCardWithListAndBoard.mockResolvedValue({
      card: {
        id: CARD_ID,
        listId: LIST_A1,
        title: "Restored card",
        position: 8192,
        dueDate: new Date("2026-08-15T00:00:00.000Z"),
        priority: "HIGH",
      },
      list: { id: LIST_A1, boardId: BOARD_A },
      board: { id: BOARD_A, workspaceId: WS_A, archivedAt: null },
    });
    const tx = makeTx();
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await restoreCardAction(formData({ cardId: CARD_ID }));

    expect(result).toEqual({ success: true });
    expect(h.emit.emitCardCreated).toHaveBeenCalledWith(BOARD_A, {
      card: expect.objectContaining({
        id: CARD_ID,
        listId: LIST_A1,
        title: "Restored card",
        position: 8192,
        dueDate: "2026-08-15T00:00:00.000Z",
        priority: "HIGH",
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/boards/${BOARD_A}`);
    expect(h.emit.emitAnalyticsRefresh).toHaveBeenCalledWith(WS_A);
    // Same-transaction restore history, payload pinned.
    expect(tx.cardHistoryEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          cardId: CARD_ID,
          eventType: "CARD_RESTORED",
        }),
      ],
      skipDuplicates: false,
    });
  });
});
