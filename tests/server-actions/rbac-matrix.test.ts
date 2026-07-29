/**
 * US-007 — RBAC matrix tests: viewer/editor/admin allowed/denied per action.
 *
 * Pairs with US-006. US-006 proves the security *boundary* (auth → permission
 * gate → workspace isolation) is present on every mutating action, delegating
 * the permission *decision* to a faithful copy of the matrix (`roleGrants`).
 * US-007 proves the decision itself, against the REAL sources, in three layers:
 *
 *   1. Server matrix — the real Better Auth roles (`lib/permissions.ts`) grant
 *      exactly the intended (entity, verb) per role. This is the oracle.
 *   2. UI ↔ server — the board-page UI map (`getBoardPagePermissionsForRole`)
 *      agrees with the server matrix (no over-grant, no under-grant).
 *   3. Harness copy ↔ real — the US-006 `roleGrants` copy matches the real
 *      matrix, so US-006's green stays trustworthy.
 *
 * Nothing here asserts a matrix against another copy of itself: the expected
 * allow-sets below are spelled out per cell, independent of how
 * `permissions.ts` is structured, and every layer is checked against the real
 * `role.authorize(...)`.
 */
import { describe, expect, it } from "vitest";

import { getBoardPagePermissionsForRole, type WorkspaceRole } from "@/lib/authorization";
import { admin, editor, viewer } from "@/lib/permissions";

import { roleGrants, type Role } from "./_harness";

/** A role object as Better Auth invokes it once a member's role is resolved. */
type AuthorizingRole = {
  authorize: (req: Record<string, string[]>) => { success: boolean };
};

const ROLES: Record<Role, AuthorizingRole> = { admin, editor, viewer };

/** The complete statement set — entity → every verb Better Auth knows about. */
const STATEMENTS: Record<string, string[]> = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  board: ["create", "update", "delete"],
  list: ["create", "update", "delete"],
  card: ["create", "update", "delete"],
  comment: ["create", "update", "delete"],
};

/**
 * Expected allow-set per role, written out by hand (NOT derived from
 * `permissions.ts`) so a regression in the role definitions is caught rather
 * than mirrored. `"entity:verb"` strings; absence = denied.
 */
const EXPECTED_ALLOW: Record<Role, Set<string>> = {
  // Full workspace control — every cell in the statement set.
  admin: new Set([
    "organization:update", "organization:delete",
    "member:create", "member:update", "member:delete",
    "invitation:create", "invitation:cancel",
    "board:create", "board:update", "board:delete",
    "list:create", "list:update", "list:delete",
    "card:create", "card:update", "card:delete",
    "comment:create", "comment:update", "comment:delete",
  ]),
  // Content CRUD, but board:update only (NOT create/delete); no org/member/invitation.
  editor: new Set([
    "board:update",
    "list:create", "list:update", "list:delete",
    "card:create", "card:update", "card:delete",
    "comment:create", "comment:update", "comment:delete",
  ]),
  // Read-only, can comment.
  viewer: new Set([
    "comment:create", "comment:update", "comment:delete",
  ]),
};

/** Flatten STATEMENTS into [entity, verb, "entity:verb"] tuples. */
const CELLS: Array<[string, string, string]> = Object.entries(STATEMENTS).flatMap(
  ([entity, verbs]) => verbs.map((verb) => [entity, verb, `${entity}:${verb}`] as [string, string, string]),
);

const ROLE_NAMES: Role[] = ["admin", "editor", "viewer"];

describe("Layer 1 — real server matrix (lib/permissions.ts)", () => {
  for (const role of ROLE_NAMES) {
    describe(role, () => {
      for (const [entity, verb, cell] of CELLS) {
        const shouldAllow = EXPECTED_ALLOW[role].has(cell);
        it(`${shouldAllow ? "allows" : "denies"} ${cell}`, () => {
          expect(ROLES[role].authorize({ [entity]: [verb] }).success).toBe(shouldAllow);
        });
      }
    });
  }

  it("enforces AND semantics across a multi-verb request", () => {
    // Route through the loose map (as the gate does at runtime) so cross-entity
    // requests aren't rejected by each role's own narrow statement type.
    const a = ROLES.admin, e = ROLES.editor, v = ROLES.viewer;
    // editor has board:update but NOT board:delete → the combined request fails.
    expect(e.authorize({ board: ["update", "delete"] }).success).toBe(false);
    // admin has both → succeeds.
    expect(a.authorize({ board: ["create", "update", "delete"] }).success).toBe(true);
    // editor across entities it fully owns → succeeds.
    expect(e.authorize({ list: ["create", "delete"], card: ["update"] }).success).toBe(true);
    // viewer comment-only: comment passes but any extra entity drags it to false.
    expect(v.authorize({ comment: ["create"], card: ["create"] }).success).toBe(false);
  });
});

describe("Layer 2 — board-page UI map agrees with the server (lib/authorization.ts)", () => {
  // Each UI affordance ↔ the server (entity, verb) it must mirror.
  const FIELD_TO_CELL: Array<[keyof ReturnType<typeof getBoardPagePermissionsForRole>, string, string]> = [
    ["canEditBoard", "board", "update"],
    ["canDeleteBoard", "board", "delete"],
    ["canCreateList", "list", "create"],
    ["canEditList", "list", "update"],
    ["canDeleteList", "list", "delete"],
    ["canCreateCard", "card", "create"],
    ["canEditCard", "card", "update"],
    ["canArchiveCard", "card", "update"], // archive = soft-delete via card update
    ["canPermanentDelete", "organization", "update"], // admin-only permanent purge
    ["canComment", "comment", "create"],
  ];

  for (const role of ROLE_NAMES) {
    describe(role, () => {
      const ui = getBoardPagePermissionsForRole(role as WorkspaceRole);
      for (const [field, entity, verb] of FIELD_TO_CELL) {
        it(`${field} matches server ${entity}:${verb}`, () => {
          const server = ROLES[role].authorize({ [entity]: [verb] }).success;
          expect(ui[field]).toBe(server);
        });
      }
    });
  }
});

describe("Layer 3 — US-006 harness copy (roleGrants) matches the real matrix", () => {
  for (const role of ROLE_NAMES) {
    describe(role, () => {
      for (const [entity, verb, cell] of CELLS) {
        it(`agrees on ${cell}`, () => {
          const real = ROLES[role].authorize({ [entity]: [verb] }).success;
          expect(roleGrants(role, { [entity]: [verb] })).toBe(real);
        });
      }
    });
  }
});
