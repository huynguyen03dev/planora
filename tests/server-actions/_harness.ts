/**
 * Shared, import-safe helpers for the US-006 Server Action security suite.
 *
 * The mutable mock state (current caller, membership map, Prisma spies) lives in
 * each test file's `vi.hoisted(...)` block — hoisting is per-file and cannot
 * reference imported symbols. This module holds only the *pure* pieces those
 * mocks delegate to, plus fixtures and assertion helpers used inside test bodies.
 *
 * The capability matrix below mirrors `lib/permissions.ts` exactly. If the real
 * roles change, this must change with them — that drift is itself a thing the
 * suite is meant to catch.
 */
import { expect } from "vitest";

export type Role = "admin" | "editor" | "viewer";

type Verb = string;
type PermissionRequest = Record<string, Verb[]>;

/**
 * Per-role granted verbs, faithful to `lib/permissions.ts`.
 * Note: `editor` may `board:update` but NOT `board:create`/`board:delete`.
 */
const ROLE_CAPS: Record<Role, PermissionRequest> = {
  admin: {
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    board: ["create", "update", "delete"],
    list: ["create", "update", "delete"],
    card: ["create", "update", "delete"],
    comment: ["create", "update", "delete"],
  },
  editor: {
    board: ["update"],
    list: ["create", "update", "delete"],
    card: ["create", "update", "delete"],
    comment: ["create", "update", "delete"],
  },
  viewer: {
    comment: ["create", "update", "delete"],
  },
};

/**
 * Mirrors what Better Auth's `auth.api.hasPermission` decides: true only if the
 * role grants every requested verb on every requested entity. This is the
 * function the mocked auth seam delegates to — so the *real*
 * `hasWorkspacePermission` (and its resource-derived `workspaceId`) runs for real.
 */
export function roleGrants(
  role: Role | undefined,
  permissions: PermissionRequest,
): boolean {
  if (!role) return false;
  const caps = ROLE_CAPS[role];
  return Object.entries(permissions).every(([entity, verbs]) => {
    const granted = caps[entity] ?? [];
    return verbs.every((v) => granted.includes(v));
  });
}

/** Minimal board record shaped like `getBoardById`'s return (carries workspaceId). */
export function boardFixture(
  workspaceId: string,
  overrides: Partial<{ id: string; title: string }> = {},
) {
  return {
    id: overrides.id ?? "board-1",
    workspaceId,
    title: overrides.title ?? "Board",
    backgroundColor: null,
    createdById: "creator",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Shaped like `getListWithBoard(listId)` — the `{ list, board }` envelope. */
export function listWithBoardFixture(
  workspaceId: string,
  opts: { boardId?: string; listId?: string } = {},
) {
  const boardId = opts.boardId ?? "board-1";
  return {
    list: {
      id: opts.listId ?? "list-1",
      boardId,
      title: "List",
      position: 16384,
      archivedAt: null as Date | null,
    },
    board: { id: boardId, workspaceId, archivedAt: null as Date | null },
  };
}

/** Shaped like `getCardWithListAndBoard(cardId)`. */
export function cardWithListAndBoardFixture(
  workspaceId: string,
  opts: { boardId?: string; cardId?: string; listId?: string } = {},
) {
  const boardId = opts.boardId ?? "board-1";
  return {
    card: { id: opts.cardId ?? "card-1", title: "Card" },
    list: { id: opts.listId ?? "list-1", boardId },
    board: { id: boardId, workspaceId, archivedAt: null },
  };
}

/** Shaped like `getCardWithListAndMembers(cardId)`. */
export function cardWithListAndMembersFixture(
  workspaceId: string,
  opts: { boardId?: string; cardId?: string; listId?: string } = {},
) {
  const boardId = opts.boardId ?? "board-1";
  return {
    card: {
      id: opts.cardId ?? "card-1",
      completedAt: null as Date | null,
      estimateHours: null as number | null,
      dueDate: null as Date | null,
    },
    list: { id: opts.listId ?? "list-1", boardId },
    board: { id: boardId, workspaceId },
    memberIds: [] as string[],
  };
}

/** Shaped like `getLabelWithBoard(labelId)` — `{ id, boardId, board }`. */
export function labelWithBoardFixture(
  workspaceId: string,
  opts: { boardId?: string; labelId?: string } = {},
) {
  const boardId = opts.boardId ?? "board-1";
  return {
    id: opts.labelId ?? "label-1",
    boardId,
    board: { id: boardId, workspaceId, archivedAt: null },
  };
}

/** Build a FormData from a plain object (Server Actions take FormData). */
export function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Assert that none of the given write spies were invoked (the core safety claim). */
export function expectNoWrites(...spies: Array<{ mock: { calls: unknown[] } }>) {
  for (const spy of spies) {
    expect(spy.mock.calls).toHaveLength(0);
  }
}
