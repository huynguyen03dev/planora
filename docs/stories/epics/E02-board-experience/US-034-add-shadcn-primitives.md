# US-034 Add missing shadcn primitives (textarea, popover, badge, avatar, progress)

## Status

shipped — 2026-06-26 (manual / build proof). Additive only; adoption tracked by
US-035.

## Lane

normal

## Product Contract

The design system must expose the shadcn primitives that the board/card UI needs
to retire its hand-rolled substitutes. After this story, `components/ui/` contains
`textarea`, `popover`, `badge`, `avatar`, and `progress`, installed via the shadcn
CLI in the project's configured style (`radix-vega`, neutral base, CSS variables),
ready for adoption.

This story is **additive only** — it installs the primitives; it does **not**
adopt them in any feature surface. Adoption is US-035 (hand-rolled UI → primitives)
and Theme B/C surfaces (US-030/US-031). No existing component changes here.

## Relevant Product Docs

- `docs/stories/initiatives/IN-02-board-ux-polish-and-design-system-consistency.md`
  — Theme D core; this story unblocks US-035 (adopt) and US-036 (tokenize), and
  the card-face/dialog work in Themes B/C.

## Acceptance Criteria

- `components/ui/textarea.tsx`, `popover.tsx`, `badge.tsx`, `avatar.tsx`, and
  `progress.tsx` exist, added via `npx shadcn add`, matching the existing
  `components.json` config (style `radix-vega`, alias `@/components/ui`).
- New runtime dependencies the primitives require resolve against the already
  installed unified `radix-ui` package where possible; any genuinely new package
  is recorded.
- `npx tsc --noEmit` is clean (no new errors from the added files).
- `npm run build` still type-checks/compiles.
- No existing surface changes behavior or appearance (purely additive — nothing
  imports the new primitives yet).

## Design Notes

- Commands: none (no Server Action).
- Queries: none.
- API: none.
- Tables: none (no schema change).
- Domain rules: none.
- UI surfaces: new `components/ui/*` primitive files only; no feature surface
  adopts them in this story.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-034 --unit 0 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — shadcn-generated primitives carry no project logic to unit-test. |
| Integration | n/a — no integration until US-035 adopts them. |
| E2E | n/a |
| Platform | n/a |
| Release | `tsc --noEmit` clean + `npm run build` compiles with the new files present. |

## Harness Delta

None. Reuses E02-board-experience epic and the IN-02 initiative; no template or
CLI change. Proof is build/typecheck-only because no behavior ships (IN-01
untested-component residual still stands and is out of scope here).

## Evidence

- `npx shadcn@latest add textarea popover badge avatar progress --yes` →
  "Created 5 files" in `components/ui/`.
- All 5 import from the already-installed unified `radix-ui` package
  (`Popover`, `Avatar`, `Progress`, `Slot`) + `class-variance-authority`; no new
  runtime dependency added (`package.json` / lockfile unchanged).
- `npx tsc --noEmit` reports no errors in app/primitive code.
- `npm run build` → **"✓ Compiled successfully in 14.7s"** — the 5 primitives
  compile. The build's global TypeScript pass then fails **only** on the
  pre-existing untracked `scripts/perf-measure.ts` (`interactionId` on
  `PerformanceEventTiming`), which predates this story and is unrelated to it.
  Tracked as a separate cleanup, not part of US-034.
- `npx eslint` on the 5 files: clean.
