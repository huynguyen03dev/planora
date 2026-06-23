# Validation

## Contract

For every workspace role (admin, editor, viewer), the allow/deny decision on
every (entity, verb) is proven against the real sources, and the two secondary
matrices (board-page UI map, US-006 harness copy) are proven to agree with the
authoritative server matrix.

## Expectations

| Layer | Asserts | Oracle |
| --- | --- | --- |
| 1 — server matrix | every role × entity × verb cell; multi-verb AND semantics | real `admin`/`editor`/`viewer.authorize` |
| 2 — UI ↔ server | `getBoardPagePermissionsForRole` field == server cell, all roles | real `authorize` |
| 3 — harness ↔ real | `roleGrants(role, …)` == `authorize(...).success`, full matrix | real `authorize` |

## Proof status

**Implemented (2026-06-23).** `tests/server-actions/rbac-matrix.test.ts` — 142
cases, all green; full suite 362 green; `tsc --noEmit` clean.

- **Layer 1** — every role × (entity, verb) cell over the complete statement
  set {organization, member, invitation, board, list, card, comment} against the
  real `admin`/`editor`/`viewer` from `lib/permissions.ts`, plus four AND-
  semantics cases.
- **Layer 2** — all 9 `BoardPagePermissions` fields × 3 roles, each equal to its
  server (entity, verb) decision.
- **Layer 3** — `roleGrants` (US-006 copy) equals the real `authorize` decision
  for every cell × 3 roles.

**Sabotage-verified per layer** (each reverted clean):
- Loosen `editor` to `board:["create","update"]` → Layer 1 + Layer 3 red.
- Flip `rolePermissionMap.viewer.canComment` to false → Layer 2 red.
- Drop a verb from the `roleGrants` copy → Layer 3 red (all 3 roles).

**Finding (fixed in this story):** `docs/product/workspaces-and-access.md`
claimed `editor` could *create* boards; the real role grants `board:["update"]`
only. The product table was corrected to match the proven matrix. No code
change — the role definitions were already correct.
