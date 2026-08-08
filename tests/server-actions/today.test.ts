/**
 * US-083 W6 — `getPersonalWorkCards` read-model integration.
 *
 * `/today` is a PERSONAL, cross-workspace read model: workspace scope is
 * derived server-side from the session user's memberships — the query NEVER
 * accepts workspace ids from the caller (a client-supplied workspace id could
 * widen the read past the caller's memberships). Proof here is the query
 * shape: membership derivation, the exact `where` contract (assigned +
 * card/list/board live + completed-excluded), and a single bounded read model
 * (one membership query + one card query, no N+1).
 *
 * US-083 follow-up (explicit pagination, no silent cap): the paginated path
 * fetches limit+1 rows (exact hasMore), applies a (dueDate, id) keyset
 * predicate when a cursor is given, and keeps the legacy unbounded path
 * byte-identical when called without options. `loadMoreTodayCardsAction`
 * (the "Load more" seam) is proven here too: auth, input validation, the
 * membership-only isolation (it accepts no workspace id), and the cursor +
 * limit forwarding into the same read model.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formData } from "./_harness";

const h = vi.hoisted(() => {
  const db = {
    workspaceMember: { findMany: vi.fn() },
    card: { findMany: vi.fn() },
  };
  return { db, verifySession: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));

import { loadMoreTodayCardsAction } from "@/app/(authenticated)/(dashboard)/today/actions";
import { getPersonalWorkCards } from "@/lib/today-query";

const USER_ID = "user-1";
const WS_A = "ws-a";
const WS_B = "ws-b";
const CURSOR_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function membership(organizationId: string) {
  return { organizationId };
}

function cardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    title: "Ship it",
    dueDate: new Date("2026-08-03T09:00:00.000Z"),
    completedAt: null,
    priority: "HIGH",
    list: {
      id: "list-1",
      title: "To Do",
      board: {
        id: "board-1",
        title: "Product Roadmap",
        workspaceId: WS_A,
        workspace: { name: "Acme" },
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  h.db.workspaceMember.findMany.mockReset();
  h.db.card.findMany.mockReset();
  h.verifySession.mockReset();
  h.verifySession.mockResolvedValue({
    userId: USER_ID,
    user: { id: USER_ID, name: "QA", email: "qa@e2e.test" },
    session: {},
  });
});

describe("getPersonalWorkCards — cross-workspace read model", () => {
  it("derives the workspace scope from the caller's memberships only", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A), membership(WS_B)]);
    h.db.card.findMany.mockResolvedValue([]);

    const model = await getPersonalWorkCards(USER_ID);

    expect(h.db.workspaceMember.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { organizationId: true },
    });
    const where = h.db.card.findMany.mock.calls[0][0].where;
    expect(where.list.board.workspaceId).toEqual({ in: [WS_A, WS_B] });
    expect(model.workspaceCount).toBe(2);
  });

  it("never includes a foreign workspace id in the query (isolation)", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A)]);
    h.db.card.findMany.mockResolvedValue([]);

    await getPersonalWorkCards(USER_ID);

    const where = h.db.card.findMany.mock.calls[0][0].where;
    expect(where.list.board.workspaceId).toEqual({ in: [WS_A] });
    expect(where.list.board.workspaceId.in).not.toContain("ws-c");
  });

  it("applies the full live-card contract: assigned + card/list/board live + completed excluded", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A), membership(WS_B)]);
    h.db.card.findMany.mockResolvedValue([]);

    await getPersonalWorkCards(USER_ID);

    const where = h.db.card.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      archivedAt: null,
      deletedAt: null,
      completedAt: null,
      members: { some: { userId: USER_ID } },
      list: {
        archivedAt: null,
        board: {
          archivedAt: null,
          workspaceId: { in: [WS_A, WS_B] },
        },
      },
    });
  });

  it("selects only the fields the /today tiles need (bounded payload)", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A)]);
    h.db.card.findMany.mockResolvedValue([]);

    await getPersonalWorkCards(USER_ID);

    const select = h.db.card.findMany.mock.calls[0][0].select;
    expect(select).toEqual({
      id: true,
      title: true,
      dueDate: true,
      completedAt: true,
      priority: true,
      list: {
        select: {
          id: true,
          title: true,
          board: {
            select: {
              id: true,
              title: true,
              workspaceId: true,
              workspace: { select: { name: true } },
            },
          },
        },
      },
    });
  });

  it("returns a serializable plain-object model (ISO strings, no Prisma instances)", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A)]);
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    const model = await getPersonalWorkCards(USER_ID);

    expect(model.workspaceCount).toBe(1);
    expect(model.cards).toEqual([
      {
        id: "card-1",
        title: "Ship it",
        dueDate: "2026-08-03T09:00:00.000Z",
        completedAt: null,
        priority: "HIGH",
        list: { id: "list-1", title: "To Do" },
        board: {
          id: "board-1",
          title: "Product Roadmap",
          workspaceId: WS_A,
          workspace: { name: "Acme" },
        },
      },
    ]);
  });

  it("returns the accessible empty model for zero memberships and skips the card query", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([]);

    const model = await getPersonalWorkCards(USER_ID);

    expect(model).toEqual({ workspaceCount: 0, cards: [] });
    expect(h.db.card.findMany).not.toHaveBeenCalled();
  });

  it("runs exactly one membership query + one card query (no N+1)", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A), membership(WS_B)]);
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    await getPersonalWorkCards(USER_ID);

    expect(h.db.workspaceMember.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.card.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("getPersonalWorkCards — explicit pagination (US-083 follow-up)", () => {
  const DATED_CURSOR = {
    dueDate: new Date("2026-08-03T09:00:00.000Z"),
    id: CURSOR_ID,
  };

  beforeEach(() => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A)]);
  });

  it("fetches limit+1 rows and reports hasMore exactly (3 rows, limit 2 → 2 items + hasMore)", async () => {
    h.db.card.findMany.mockResolvedValue([
      cardRow(),
      cardRow({ id: "card-2", title: "Second" }),
      cardRow({ id: "card-3", title: "Third" }),
    ]);

    const page = await getPersonalWorkCards(USER_ID, { limit: 2 });

    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.take).toBe(3);
    expect(page).toEqual({
      workspaceCount: 1,
      hasMore: true,
      items: [
        expect.objectContaining({ id: "card-1" }),
        expect.objectContaining({ id: "card-2" }),
      ],
    });
    expect(h.db.card.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.workspaceMember.findMany).toHaveBeenCalledTimes(1);
  });

  it("reports hasMore false when the page is short (no full extra row)", async () => {
    h.db.card.findMany.mockResolvedValue([cardRow(), cardRow({ id: "card-2" })]);

    const page = await getPersonalWorkCards(USER_ID, { limit: 5 });

    expect(page.hasMore).toBe(false);
    expect(page.items.map((item) => item.id)).toEqual(["card-1", "card-2"]);
  });

  it("defaults the page size to TODAY_PAGE_SIZE when options omit limit", async () => {
    h.db.card.findMany.mockResolvedValue([]);

    await getPersonalWorkCards(USER_ID, {});

    expect(h.db.card.findMany.mock.calls[0][0].take).toBe(31);
  });

  it("keeps the legacy unbounded behavior without options (no take, legacy orderBy)", async () => {
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    const model = await getPersonalWorkCards(USER_ID);

    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.take).toBeUndefined();
    expect(args.orderBy).toEqual([{ dueDate: "asc" }, { title: "asc" }]);
    expect(model).toEqual({
      workspaceCount: 1,
      cards: [expect.objectContaining({ id: "card-1" })],
    });
  });

  it("applies the dated keyset predicate when a cursor is given (no skip, no duplicate)", async () => {
    h.db.card.findMany.mockResolvedValue([]);

    await getPersonalWorkCards(USER_ID, { limit: 2, cursor: DATED_CURSOR });

    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.take).toBe(3);
    expect(args.orderBy).toEqual([{ dueDate: "asc" }, { id: "asc" }]);
    expect(args.where.OR).toEqual([
      { dueDate: { not: null, lt: new Date("2026-08-03T09:00:00.000Z") } },
      { dueDate: new Date("2026-08-03T09:00:00.000Z"), id: { gt: CURSOR_ID } },
      { dueDate: { not: null, gt: new Date("2026-08-03T09:00:00.000Z") } },
      { dueDate: null },
    ]);
    // The live-card contract is still AND-ed with the keyset predicate.
    expect(args.where.archivedAt).toBeNull();
    expect(args.where.members).toEqual({ some: { userId: USER_ID } });
  });

  it("applies the no-due tail predicate when the cursor's dueDate is null", async () => {
    h.db.card.findMany.mockResolvedValue([]);

    await getPersonalWorkCards(USER_ID, {
      limit: 2,
      cursor: { dueDate: null, id: CURSOR_ID },
    });

    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ dueDate: null, id: { gt: CURSOR_ID } }]);
  });

  it("paginated rows are serialized to the same ISO plain-object shape", async () => {
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    const page = await getPersonalWorkCards(USER_ID, { limit: 2 });

    expect(page.items).toEqual([
      {
        id: "card-1",
        title: "Ship it",
        dueDate: "2026-08-03T09:00:00.000Z",
        completedAt: null,
        priority: "HIGH",
        list: { id: "list-1", title: "To Do" },
        board: {
          id: "board-1",
          title: "Product Roadmap",
          workspaceId: WS_A,
          workspace: { name: "Acme" },
        },
      },
    ]);
  });

  it("zero memberships with options returns the empty page and skips the card query", async () => {
    h.db.workspaceMember.findMany.mockResolvedValue([]);

    const page = await getPersonalWorkCards(USER_ID, { limit: 2 });

    expect(page).toEqual({ workspaceCount: 0, items: [], hasMore: false });
    expect(h.db.card.findMany).not.toHaveBeenCalled();
  });
});

describe("loadMoreTodayCardsAction — auth, isolation & cursor forwarding", () => {
  beforeEach(() => {
    h.db.workspaceMember.findMany.mockResolvedValue([membership(WS_A)]);
  });

  it("A1 auth: rejects before any read when unauthenticated", async () => {
    h.verifySession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(loadMoreTodayCardsAction(formData({ limit: "50" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(h.db.card.findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the session or the DB", async () => {
    const r = await loadMoreTodayCardsAction(formData({ limit: "0" }));

    expect(r).toEqual({ success: false, error: expect.any(String) });
    expect(h.verifySession).not.toHaveBeenCalled();
    expect(h.db.card.findMany).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID cursor id", async () => {
    const r = await loadMoreTodayCardsAction(
      formData({ limit: "50", cursorId: "not-a-uuid", cursorDueDate: "2026-08-03T09:00:00.000Z" }),
    );
    expect(r.success).toBe(false);
    expect(h.db.card.findMany).not.toHaveBeenCalled();
  });

  it("rejects a non-datetime cursor due date", async () => {
    const r = await loadMoreTodayCardsAction(
      formData({ limit: "50", cursorId: CURSOR_ID, cursorDueDate: "yesterday" }),
    );
    expect(r.success).toBe(false);
    expect(h.db.card.findMany).not.toHaveBeenCalled();
  });

  it("forwards the parsed dated cursor + limit into the read model", async () => {
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    const r = await loadMoreTodayCardsAction(
      formData({ limit: "50", cursorId: CURSOR_ID, cursorDueDate: "2026-08-03T09:00:00.000Z" }),
    );

    expect(r).toEqual({
      success: true,
      hasMore: false,
      items: [expect.objectContaining({ id: "card-1" })],
    });
    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.take).toBe(51);
    expect(args.where.OR).toEqual([
      { dueDate: { not: null, lt: new Date("2026-08-03T09:00:00.000Z") } },
      { dueDate: new Date("2026-08-03T09:00:00.000Z"), id: { gt: CURSOR_ID } },
      { dueDate: { not: null, gt: new Date("2026-08-03T09:00:00.000Z") } },
      { dueDate: null },
    ]);
  });

  it("empty-string cursorDueDate is a null-dueDate cursor (the no-due tail), not no cursor", async () => {
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    const r = await loadMoreTodayCardsAction(
      formData({ limit: "50", cursorId: CURSOR_ID, cursorDueDate: "" }),
    );

    expect(r.success).toBe(true);
    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ dueDate: null, id: { gt: CURSOR_ID } }]);
  });

  it("no cursor fields = first page (no keyset predicate, default page size)", async () => {
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    const r = await loadMoreTodayCardsAction(formData({}));

    expect(r.success).toBe(true);
    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.take).toBe(31);
    expect(args.where.OR).toBeUndefined();
  });

  it("ignores a client-supplied workspaceId — scope is membership-derived only", async () => {
    h.db.card.findMany.mockResolvedValue([cardRow()]);

    const r = await loadMoreTodayCardsAction(
      formData({ limit: "50", workspaceId: "ws-evil" }),
    );

    expect(r.success).toBe(true);
    const args = h.db.card.findMany.mock.calls[0][0];
    expect(args.where.list.board.workspaceId).toEqual({ in: [WS_A] });
    expect(args.where.list.board.workspaceId.in).not.toContain("ws-evil");
  });

  it("maps the read model's hasMore through when a full extra row exists", async () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      cardRow({ id: `card-${i}`, title: `Card ${i}` }),
    );
    h.db.card.findMany.mockResolvedValue(rows);

    const r = await loadMoreTodayCardsAction(formData({ limit: "50" }));

    expect(r).toEqual({
      success: true,
      hasMore: true,
      items: rows.slice(0, 50).map((row) => expect.objectContaining({ id: row.id })),
    });
  });
});
