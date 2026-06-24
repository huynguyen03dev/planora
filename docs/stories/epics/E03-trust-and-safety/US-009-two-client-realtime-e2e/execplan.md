# Execution Plan

1. **Branch** `feat/realtime-e2e-US-009` off `dev`.
2. **Tooling:** add `@playwright/test`; `playwright install chromium`. Verify the
   browser launches in this environment.
3. **Map the flow** (signup → workspace → board → list → card → socket join) to
   get real selectors, URL patterns, and the `workspaceMember` shape.
4. **Harness:** `playwright.config.ts` (webServer = `npm run dev`, 1 worker),
   `e2e/helpers/app.ts` (UI flows), `e2e/helpers/db.ts` (raw `pg` arrange/teardown).
5. **Test:** `e2e/realtime-card-create.spec.ts` — two contexts; Alice creates
   board+list, Bob seeded as member, Bob loads board, Alice adds card, assert it
   appears live on Bob's page (ordering proof).
6. **Run** `npm run test:e2e` → green.
7. **Sabotage-verify:** guard `emitCardCreated` behind `if (false)` → the Bob
   assertion goes red while Alice's own card still renders; revert clean.
8. **Guard the gate:** confirm `npm run lint`, `npx tsc --noEmit`, and `npm test`
   (vitest) all stay green with the new files; vitest ignores `e2e/**`.
9. **CI:** separate non-blocking `.github/workflows/e2e.yml` (Postgres service,
   migrate deploy, browser install, run). `.gitignore` Playwright artifacts.
10. **Docs:** packet, `docs/TEST_MATRIX.md`, `docs/product/realtime-sync.md`.
11. **Register** with `harness-cli story add`.
12. **PR** `--base dev`; CI gate (ci.yml) + e2e.yml both run on it; ask before
    merging.

## Verify command

`npm run test:e2e`
