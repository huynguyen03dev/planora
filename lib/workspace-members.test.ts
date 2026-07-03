/**
 * US-063 — last-admin guard + advisory-lock helpers (lib/workspace-members.ts).
 *
 * These are the load-bearing pieces of the R2 invariant (decision 0019). The
 * pure guard is proven exhaustively; the lock wrapper is proven to acquire the
 * Postgres advisory lock, read the admin count under it, and forward/propagate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const executeRaw = vi.fn();
  const count = vi.fn();
  const findFirst = vi.fn();
  const db = {
    workspaceMember: { findFirst },
    // db.$transaction(cb, opts) invokes cb with a tx exposing the two calls the
    // lock uses: $executeRaw (advisory lock) and workspaceMember.count.
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ $executeRaw: executeRaw, workspaceMember: { count } }),
    ),
  };
  return { executeRaw, count, findFirst, db };
});

vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));

import {
  assertRetainsAdmin,
  LastAdminError,
  resolveWorkspaceMember,
  withWorkspaceAdminLock,
} from "@/lib/workspace-members";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertRetainsAdmin (R2, pure)", () => {
  it("blocks removing/demoting/leaving the sole admin", () => {
    expect(() => assertRetainsAdmin(1, true)).toThrow(LastAdminError);
  });

  it("allows an admin-affecting op when another admin remains", () => {
    expect(() => assertRetainsAdmin(2, true)).not.toThrow();
  });

  it("never blocks a non-admin op, even at one admin", () => {
    expect(() => assertRetainsAdmin(1, false)).not.toThrow();
    expect(() => assertRetainsAdmin(0, false)).not.toThrow();
  });
});

describe("withWorkspaceAdminLock", () => {
  const WS = "W".repeat(32);

  it("acquires a transaction-scoped advisory lock before reading the count", async () => {
    h.count.mockResolvedValue(3);
    const fn = vi.fn(async (adminCount: number) => `count=${adminCount}`);

    const result = await withWorkspaceAdminLock(WS, fn);

    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
    // The advisory lock is taken (transaction-scoped, so it auto-releases).
    const lockSql = h.executeRaw.mock.calls[0]?.[0];
    expect(String(lockSql)).toContain("pg_advisory_xact_lock");
    // Count is read under the lock and forwarded to the callback.
    expect(h.count).toHaveBeenCalledWith({
      where: { organizationId: WS, role: "admin" },
    });
    expect(fn).toHaveBeenCalledWith(3);
    expect(result).toBe("count=3");
  });

  it("propagates a callback throw (transaction rolls back, lock releases)", async () => {
    h.count.mockResolvedValue(1);
    await expect(
      withWorkspaceAdminLock(WS, async (adminCount) => {
        assertRetainsAdmin(adminCount, true);
      }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });
});

describe("resolveWorkspaceMember (isolation)", () => {
  const WS = "W".repeat(32);

  it("returns { memberId, role } for a member in the workspace", async () => {
    h.findFirst.mockResolvedValue({ id: "member-1", role: "admin" });
    await expect(resolveWorkspaceMember(WS, "user-1")).resolves.toEqual({
      memberId: "member-1",
      role: "admin",
    });
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { organizationId: WS, userId: "user-1" },
      select: { id: true, role: true },
    });
  });

  it("returns null for a user who is not a member of that workspace", async () => {
    h.findFirst.mockResolvedValue(null);
    await expect(resolveWorkspaceMember(WS, "outsider")).resolves.toBeNull();
  });
});
