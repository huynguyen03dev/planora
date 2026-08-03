import "server-only";

import db from "@/lib/prisma";

export type ManagedWorkspaceMember = {
  /** WorkspaceMember.id — the id Better Auth's member APIs key on. */
  memberId: string;
  /** User.id — the id the client passes back to target a member. */
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

/**
 * The workspace's members shaped for the management surface. Workspace-scoped
 * (isolation) and `select`-limited. Sorted admins-first, then by join time, so
 * the list reads sensibly without a client sort.
 */
export async function getWorkspaceMembersForManagement(
  workspaceId: string,
): Promise<ManagedWorkspaceMember[]> {
  const members = await db.workspaceMember.findMany({
    where: { organizationId: workspaceId },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      user: { select: { name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const roleRank: Record<string, number> = { admin: 0, editor: 1, viewer: 2 };
  return members
    .map((member) => ({
      memberId: member.id,
      userId: member.userId,
      name: member.user.name ?? "Unknown",
      email: member.user.email,
      image: member.user.image,
      role: member.role,
    }))
    .sort((a, b) => (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3));
}

/**
 * Resolve a `(workspaceId, userId)` pair to the member's `{ memberId, role }`,
 * or null when there is no such member in that workspace. The workspace scope on
 * the query is the isolation check: a target outside the caller's workspace
 * resolves to null and the action denies before any write.
 */
export async function resolveWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<{ memberId: string; role: string } | null> {
  const member = await db.workspaceMember.findFirst({
    where: { organizationId: workspaceId, userId },
    select: { id: true, role: true },
  });

  return member ? { memberId: member.id, role: member.role } : null;
}

/** Thrown when a mutation would drop a workspace below one admin (R2). */
export class LastAdminError extends Error {
  constructor() {
    super("A workspace must keep at least one admin.");
    this.name = "LastAdminError";
  }
}

/**
 * The last-admin invariant (R2), as a pure guard. `willRemoveAdmin` is true when
 * the pending op removes, demotes, or lets leave a member who currently holds
 * admin. Call it inside {@link withWorkspaceAdminLock} so `adminCount` is read
 * under the lock. Pure so it is unit-testable in isolation.
 */
export function assertRetainsAdmin(
  adminCount: number,
  willRemoveAdmin: boolean,
): void {
  if (willRemoveAdmin && adminCount <= 1) {
    throw new LastAdminError();
  }
}

/**
 * Serialize admin-affecting mutations per workspace so the last-admin invariant
 * (R2) holds across concurrent callers (US-063 / decision 0019).
 *
 * Uses a Postgres **transaction-scoped** advisory lock: `pg_advisory_xact_lock`
 * is held on the transaction's connection for the whole callback and released
 * automatically on commit/rollback. This is pool-safe — unlike a session-level
 * `pg_advisory_lock`, whose paired `pg_advisory_unlock` could land on a different
 * pooled connection and silently fail to release. The admin count is read under
 * the lock, and the Better Auth mutation is awaited *inside* the callback so its
 * write commits before the lock releases; the next caller then reads the updated
 * count and R2 rejects it. Member management is low-frequency, so briefly holding
 * the connection across the BA write is acceptable; the timeout bounds the worst
 * case.
 */
export async function withWorkspaceAdminLock<T>(
  workspaceId: string,
  fn: (adminCount: number) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
      const adminCount = await tx.workspaceMember.count({
        where: { organizationId: workspaceId, role: "admin" },
      });
      return fn(adminCount);
    },
    { timeout: 20_000 },
  );
}
