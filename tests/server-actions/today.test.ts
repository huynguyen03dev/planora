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
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const db = {
    workspaceMember: { findMany: vi.fn() },
    card: { findMany: vi.fn() },
  };
  return { db };
});

vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));

import { getPersonalWorkCards } from "@/lib/today-query";

const USER_ID = "user-1";
const WS_A = "ws-a";
const WS_B = "ws-b";

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
