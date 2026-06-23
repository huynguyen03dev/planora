# Execution Plan

1. **Branch.** `feat/rbac-matrix-tests-US-007` off `dev`.
2. **Write `tests/server-actions/rbac-matrix.test.ts`** with the three layers:
   - Layer 1: exhaustive `role × entity × verb` over the real
     `admin`/`editor`/`viewer` from `@/lib/permissions`, plus AND-semantics
     cases.
   - Layer 2: `getBoardPagePermissionsForRole` field ↔ server-cell equality for
     all roles.
   - Layer 3: `roleGrants` (from `_harness.ts`) ↔ real `authorize` over the full
     matrix.
3. **Run** `npx vitest run tests/server-actions/rbac-matrix.test.ts`; then the
   full suite `npm test` to confirm no regression.
4. **Sabotage-verify the suite has teeth** (then revert):
   - Loosen `editor` to include `board:["create"]` → Layer 1 + Layer 3 go red.
   - Flip `rolePermissionMap.viewer.canComment` to false → Layer 2 goes red.
   - Edit `roleGrants` copy to drop a verb → Layer 3 goes red.
5. **`tsc --noEmit`** clean.
6. **Update docs:** `docs/TEST_MATRIX.md` (US-007 row + RBAC notes),
   `docs/product/workspaces-and-access.md` (RBAC proof reference),
   `validation.md` evidence.
7. **Register/verify** with `harness-cli story add` / `story verify`.
8. **PR** `--base dev`; then **ask** before merging.

## Verify command

`npx vitest run tests/server-actions/rbac-matrix.test.ts`
