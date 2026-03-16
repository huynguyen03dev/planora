import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Access-control statements for the organization plugin.
 *
 * `defaultStatements` covers the built-in org entities:
 *   organization: update, delete
 *   member:       create, update, delete
 *   invitation:   create, cancel
 *
 * We extend with app-level entities so BA can enforce them
 * when we call `auth.api.hasPermission()`.
 */
const statement = {
  ...defaultStatements,
  board: ["create", "update", "delete"],
  list: ["create", "update", "delete"],
  card: ["create", "update", "delete"],
  comment: ["create", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

/* ── Roles ─────────────────────────────────────────────────────── */

/** Full workspace control — inherits all owner-level org permissions */
export const admin = ac.newRole({
  ...ownerAc.statements,
  board: ["create", "update", "delete"],
  list: ["create", "update", "delete"],
  card: ["create", "update", "delete"],
  comment: ["create", "update", "delete"],
});

/** Content creation & editing — no org or member management */
export const editor = ac.newRole({
  board: ["update"],
  list: ["create", "update", "delete"],
  card: ["create", "update", "delete"],
  comment: ["create", "update", "delete"],
});

/** Read-only, can comment */
export const viewer = ac.newRole({
  comment: ["create", "update", "delete"],
});
