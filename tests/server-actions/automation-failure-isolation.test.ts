/**
 * US-075 — Automation rule failure isolation (decision 0030) integration suite.
 *
 * End-to-end through the REAL Server Action → REAL evaluator → REAL executor,
 * with only the DB/auth/emit seams mocked (list-card.test.ts pattern). Proves
 * the product contract: a rule step targeting a stale entity (deleted/archived
 * list, deleted label) NEVER rolls back the user's primary card mutation; the
 * action returns success and the execution is audited in RuleExecutionLog with
 * per-step structured codes + target ids in metadata.
 *
 * The lib write seams stay REAL (updateCardPriority, setCardCompletion,
 * addCardLabel, resolveCardPositionIntent, recordCardHistoryEvents) so the
 * assertion "the succeeded rule steps committed inside the user's tx" is not
 * theater: they write through the same fake transaction the action body runs.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cardWithListAndBoardFixture,
  cardWithListAndMembersFixture,
  formData,
  listWithBoardFixture,
  roleGrants,
  type Role,
} from "./_harness";

const WS_A = "A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6";
const BOARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_LIST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CARD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LABEL_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
/** A list that has been permanently deleted — the stale target. */
const STALE_LIST = "11111111-1111-4111-8111-111111111111";
/** A list that has been archived — the stale target. */
const ARCHIVED_LIST = "22222222-2222-4222-8222-222222222222";
const RULE_ID = "33333333-3333-4333-8333-333333333333";

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
    // loaders (real lib functions stay real — see the importActual mocks below)
    getBoardById: fn(),
    getListWithBoard: fn(),
    getCardWithListAndBoard: fn(),
    getArchivedCardWithListAndBoard: fn(),
    getCardWithListAndMembers: fn(),
    getLabelWithBoard: fn(),
    getCardLabels: fn(),
    getCardMembers: fn(),
    // prisma spies
    db: {
      $transaction: vi.fn(),
      card: { update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
      workspace: { findUnique: vi.fn() },
      workspaceMember: { findFirst: vi.fn() },
      ruleExecutionLog: { create: vi.fn(), update: vi.fn() },
    },
    // realtime emitters
    emit: {
      emitAnalyticsRefresh: fn(),
      emitCardMoved: fn(),
      emitCardCreated: fn(),
      emitCardUpdated: fn(),
      emitCardArchived: fn(),
      emitCardCompletionUpdated: fn(),
      emitCardLabelsUpdated: fn(),
      emitCardMembersUpdated: fn(),
      emitCommentCreated: fn(),
      emitListCreated: fn(),
      emitListMoved: fn(),
      emitListUpdated: fn(),
      emitListDeleted: fn(),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/board", () => ({ getBoardById: h.getBoardById }));
vi.mock("@/lib/list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/list")>()),
  getListWithBoard: h.getListWithBoard,
}));
vi.mock("@/lib/card", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/card")>()),
  getCardWithListAndBoard: h.getCardWithListAndBoard,
  getArchivedCardWithListAndBoard: h.getArchivedCardWithListAndBoard,
  getCardWithListAndMembers: h.getCardWithListAndMembers,
}));
vi.mock("@/lib/label", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/label")>()),
  getLabelWithBoard: h.getLabelWithBoard,
  getCardLabels: h.getCardLabels,
}));
vi.mock("@/lib/card-member", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/card-member")>()),
  getCardMembers: h.getCardMembers,
}));
vi.mock("@/lib/comment", () => ({ createComment: vi.fn() }));
vi.mock("@/lib/attachment", () => ({ createAttachment: vi.fn() }));
vi.mock("@/lib/activity", () => ({ createActivityEntry: vi.fn() }));
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
vi.mock("cloudinary", () => ({ v2: { uploader: { destroy: vi.fn() }, config: vi.fn() } }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  createCardAction,
  moveCardAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { AUTOMATION_ACTOR_USER_ID } from "@/lib/automation/index";

function signInAs(userId: string, ws: string, role: Role) {
  h.state.authed = true;
  h.state.callerId = userId;
  h.state.membership.set(`${userId}:${ws}`, role);
}

/**
 * A permissive in-memory `Prisma.TransactionClient` stand-in. Every method the
 * real action/evaluator/executor bodies call is a spy with a sensible default;
 * tests override the target-list/label/rule seams per scenario.
 */
function makeTx() {
  return {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // decision 0032 lock helpers: route raw FOR UPDATE queries by SQL text.
      const sql = strings[0] ?? "";
      const id = String(values[0] ?? "");
      if (sql.includes('FROM "list"')) {
        if (id === LIST_ID || id === TARGET_LIST) {
          return [{ id, boardId: BOARD_A, position: 16384, moveRevision: 0 }];
        }
        return [];
      }
      if (sql.includes('FROM "board"')) {
        return [{ id }];
      }
      if (sql.includes('FROM "card"')) {
        return [{ id, listId: LIST_ID, position: 16384, moveRevision: 0 }];
      }
      return [];
    }),
    card: {
      findMany: vi.fn(async () => [] as unknown[]),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        (where.id === CARD_ID || where.id === "new-card")
          ? {
              id: where.id,
              listId: LIST_ID,
              moveRevision: 0,
              list: {
                id: LIST_ID,
                boardId: BOARD_A,
                archivedAt: null,
                board: { id: BOARD_A, workspaceId: WS_A, archivedAt: null },
              },
            }
          : null,
      ),
      findUniqueOrThrow: vi.fn(async () => ({
        id: CARD_ID,
        listId: LIST_ID,
        title: "Card",
        description: null,
        position: 1,
        moveRevision: 1,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: null,
        createdById: AUTOMATION_ACTOR_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "new-card",
        listId: data.listId,
        title: data.title,
        position: data.position,
        moveRevision: 0,
        estimateHours: null,
        dueDate: null,
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: CARD_ID,
        listId: (data.listId as string) ?? LIST_ID,
        position: typeof data.position === "number" ? data.position : 1,
        estimateHours: null,
        dueDate: null,
        completedAt: data.completedAt ?? null,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    cardMember: { findMany: vi.fn(async () => [] as unknown[]) },
    cardHistoryEvent: { createMany: vi.fn(async () => ({ count: 1 })) },
    cardLabel: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    list: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        where.id === TARGET_LIST
          ? {
              id: TARGET_LIST,
              boardId: BOARD_A,
              archivedAt: null,
              board: { id: BOARD_A, workspaceId: WS_A, archivedAt: null },
            }
          : null,
      ),
    },
    label: { findUnique: vi.fn(async () => ({ board: { workspaceId: WS_A } })) },
    rule: { findMany: vi.fn(async () => [] as unknown[]) },
    ruleExecutionLog: {
      create: vi.fn(async () => ({ id: "log-1" })),
      update: vi.fn(async () => ({ id: "log-1" })),
    },
  };
}

function sameBoardSetup() {
  h.getCardWithListAndBoard.mockResolvedValue(
    cardWithListAndBoardFixture(WS_A, { boardId: BOARD_A, cardId: CARD_ID, listId: LIST_ID }),
  );
  h.getListWithBoard.mockResolvedValue(
    listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: TARGET_LIST }),
  );
  h.getCardWithListAndMembers.mockResolvedValue(
    cardWithListAndMembersFixture(WS_A, { boardId: BOARD_A, cardId: CARD_ID, listId: LIST_ID }),
  );
  h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
}

/** Wire the tx rule seam so only rules of the evaluated trigger match (real-DB fidelity). */
function rulesMock(
  tx: ReturnType<typeof makeTx>,
  rules: Array<{ triggerType: string } & Record<string, unknown>>,
) {
  (tx.rule.findMany as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ where }: { where: { triggerType?: string } }) =>
      rules.filter((r) => r.triggerType === where.triggerType),
  );
}

/** The RuleExecutionLog row the evaluator wrote in-tx (first create call). */
function lastLogCreate(tx: ReturnType<typeof makeTx>) {
  const calls = (tx.ruleExecutionLog.create as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as { data: Record<string, unknown> };
}

beforeAll(() => {
  signInAs("actor", WS_A, "admin");
});

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = "actor";
  h.state.authed = true;
  h.state.membership.set(`${"actor"}:${WS_A}`, "admin");
  h.db.$transaction.mockResolvedValue(undefined);
  h.getCardLabels.mockResolvedValue([]);
  h.getCardMembers.mockResolvedValue([]);
});

describe("createCardAction + stale rule target (decision 0030 isolation)", () => {
  it("a deleted target list in the middle of a 3-step rule: card creates, steps 1+3 commit, step 2 audited → partially_failed", async () => {
    signInAs("actor", WS_A, "admin");
    h.getListWithBoard.mockResolvedValue(
      listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_ID }),
    );

    const tx = makeTx();
    // The enabled rule fires on card-created: set priority → move to a DELETED
    // list → complete the card.
    rulesMock(tx, [
      {
        id: RULE_ID,
        name: "Move to stale list",
        boardId: BOARD_A,
        triggerType: "card-created",
        triggerConfig: {},
        actions: [
          { type: "set-priority", priority: "HIGH" },
          { type: "move-card-to-list", targetListId: STALE_LIST },
          { type: "set-completion", completed: true },
        ],
      },
    ]);
    // The stale list is gone — the executor's target check finds nothing.
    (tx.list.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await createCardAction(formData({ listId: LIST_ID, title: "T" }));

    // INVARIANT #1: the user's primary mutation commits and returns success.
    expect(result).toEqual({ success: true, cardId: "new-card" });
    expect(tx.card.create).toHaveBeenCalledTimes(1);

    // INVARIANT #3: independent siblings still executed — step 1 (priority)
    // and step 3 (completion) wrote through the shared tx…
    expect(tx.card.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "new-card" }),
        data: expect.objectContaining({ priority: "HIGH" }),
      }),
    );
    expect(tx.card.updateMany).toHaveBeenCalled();
    // …and step 2 never moved the card into the stale list.
    const moveAttempts = (tx.card.update as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => (c[0] as { data?: { listId?: string } }).data?.listId === STALE_LIST,
    );
    expect(moveAttempts).toHaveLength(0);

    // INVARIANT #2: one audit row, status partially_failed, per-step metadata
    // with the structured code + stale target id.
    const log = lastLogCreate(tx);
    expect(log.data).toMatchObject({
      ruleId: RULE_ID,
      status: "partially_failed",
      error: "1 of 3 action steps failed",
    });
    expect(log.data.metadata).toEqual({
      steps: [
        { stepIndex: 0, actionType: "set-priority", status: "success" },
        expect.objectContaining({
          stepIndex: 1,
          actionType: "move-card-to-list",
          status: "failed",
          code: "TARGET_LIST_NOT_FOUND",
          targetId: STALE_LIST,
        }),
        { stepIndex: 2, actionType: "set-completion", status: "success" },
      ],
    });

    // INVARIANT #5: no deferred effect from the isolated-failed step — the
    // card-moved emit never fires; the succeeded steps' effects do.
    expect(h.emit.emitCardMoved).not.toHaveBeenCalled();
    expect(h.emit.emitCardCompletionUpdated).toHaveBeenCalled();
    expect(h.emit.emitCardCreated).toHaveBeenCalled();
  });

  it("a deleted LABEL target: card creates, rule fully fails with LABEL_NOT_FOUND, no attach attempted", async () => {
    signInAs("actor", WS_A, "admin");
    h.getListWithBoard.mockResolvedValue(
      listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_ID }),
    );

    const tx = makeTx();
    rulesMock(tx, [
      {
        id: RULE_ID,
        name: "Attach deleted label",
        boardId: BOARD_A,
        triggerType: "card-created",
        triggerConfig: {},
        actions: [{ type: "add-label", labelId: LABEL_ID }],
      },
    ]);
    (tx.label.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await createCardAction(formData({ listId: LIST_ID, title: "T" }));

    expect(result).toEqual({ success: true, cardId: "new-card" });
    // The label guard fired BEFORE any attach — no FK-violation crash, no write.
    expect(tx.cardLabel.create).not.toHaveBeenCalled();

    const log = lastLogCreate(tx);
    expect(log.data).toMatchObject({ status: "failed", error: "1 of 1 action steps failed" });
    expect(log.data.metadata).toEqual({
      steps: [
        expect.objectContaining({
          status: "failed",
          code: "LABEL_NOT_FOUND",
          targetId: LABEL_ID,
        }),
      ],
    });
  });

  it("an UNEXPECTED error inside a rule step still aborts: action fails, no in-tx row, post-rollback error row (decision 0030 class 2)", async () => {
    signInAs("actor", WS_A, "admin");
    h.getListWithBoard.mockResolvedValue(
      listWithBoardFixture(WS_A, { boardId: BOARD_A, listId: LIST_ID }),
    );

    const tx = makeTx();
    rulesMock(tx, [
      {
        id: RULE_ID,
        name: "Exploding rule",
        boardId: BOARD_A,
        triggerType: "card-created",
        triggerConfig: {},
        actions: [{ type: "set-priority", priority: "URGENT" }],
      },
    ]);
    // updateCardPriority is the REAL lib function — it writes via tx.card.update.
    // Make that write fail with a systemic error (not a RuleExecutionError).
    (tx.card.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("db exploded"),
    );
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await createCardAction(formData({ listId: LIST_ID, title: "T" }));

    // INVARIANT #4: unexpected class retains abort semantics — the user's card
    // mutation rolls back and the action reports the unexpected-abort message.
    expect(result).toEqual({
      success: false,
      error:
        'Automation rule "Exploding rule" hit an unexpected error; no changes were applied.',
    });
    // No in-tx audit row for the aborted rule…
    expect(tx.ruleExecutionLog.create).not.toHaveBeenCalled();
    // …but the post-rollback error row exists (top-level db, not the tx).
    const postRollback = (h.db.ruleExecutionLog.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(postRollback.length).toBeGreaterThan(0);
    expect(postRollback[0][0]).toMatchObject({
      data: expect.objectContaining({
        ruleId: RULE_ID,
        status: "error",
        error: "db exploded",
      }),
    });
  });
});

describe("moveCardAction + stale rule target (decision 0030 isolation)", () => {
  it("an ARCHIVED target list: the user's own move commits, the rule step is audited → failed", async () => {
    signInAs("actor", WS_A, "admin");
    sameBoardSetup();

    const tx = makeTx();
    rulesMock(tx, [
      {
        id: RULE_ID,
        name: "Move to archived",
        boardId: BOARD_A,
        triggerType: "card-moved-to-list",
        triggerConfig: {},
        actions: [{ type: "move-card-to-list", targetListId: ARCHIVED_LIST }],
      },
    ]);
    (tx.list.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { id?: string } }) =>
        where.id === ARCHIVED_LIST
          ? {
              id: ARCHIVED_LIST,
              boardId: BOARD_A,
              archivedAt: new Date("2026-07-01T00:00:00Z"),
              board: { id: BOARD_A, workspaceId: WS_A, archivedAt: null },
            }
          : {
              id: TARGET_LIST,
              boardId: BOARD_A,
              archivedAt: null,
              board: { id: BOARD_A, workspaceId: WS_A, archivedAt: null },
            },
    );
    h.db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));

    const result = await moveCardAction(
      formData({ cardId: CARD_ID, targetListId: TARGET_LIST, intent: "end" }),
    );

    // The user's cross-list move succeeded — archived rule targets never roll
    // back the primary mutation (the F4 collateral-damage bug is dead).
    expect(result).toEqual({ success: true });
    expect(tx.card.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: CARD_ID, moveRevision: 0 }),
        data: expect.objectContaining({ listId: TARGET_LIST, position: 16384, moveRevision: 1 }),
      }),
    );
    // The rule's move to the archived list never wrote.
    const archivedAttempts = (tx.card.update as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => (c[0] as { data?: { listId?: string } }).data?.listId === ARCHIVED_LIST,
    );
    expect(archivedAttempts).toHaveLength(0);

    // Audit: status failed (only step failed), code + target id in metadata.
    const log = lastLogCreate(tx);
    expect(log.data).toMatchObject({
      ruleId: RULE_ID,
      triggerType: "card-moved-to-list",
      status: "failed",
      error: "1 of 1 action steps failed",
    });
    expect(log.data.metadata).toEqual({
      steps: [
        expect.objectContaining({
          status: "failed",
          code: "TARGET_LIST_ARCHIVED",
          targetId: ARCHIVED_LIST,
        }),
      ],
    });
  });
});
