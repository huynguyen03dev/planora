# IN-01 Production Readiness & Trello Parity

## Status

proposed

## Type

Initiative (umbrella). Decomposes into the candidate child stories below; each
child re-enters `docs/FEATURE_INTAKE.md` on its own and gets its own lane.

## Lane (aggregate)

high-risk — touches auth, authorization, data model, audit/security, external
systems, public contracts, cross-platform, existing behavior, weak proof, and
multiple product domains at once. Individual child stories will range from tiny
to high-risk.

## Problem Statement

A product-owner survey (2026-06-23) concluded Planora is a well-architected,
~70%-complete kanban tool that clears **neither** bar it is aiming for:

- **Not production-ready** — the entire mutation boundary (Server Actions, auth,
  RBAC, workspace-isolation scoping) is unverified, and there is no CI test gate.
  For a multi-tenant app an untested isolation boundary is a latent data-leak,
  not deferrable polish.
- **Not Trello-level** — the features users reach for every workday (search,
  filtering) do not exist, and checklists ship as a disabled placeholder button.

A recurring pattern: **the schema writes promises the UI does not cash.**
`Priority`, `coverImage`, `BoardStar`, and the `DUE_DATE` / `MENTIONED`
notification types all have data models with no working surface. This inflates
the "looks done" impression and is scope debt to retire deliberately.

## Goal / Definition of Done

A multi-tenant kanban app that (a) a customer can trust their data to —
isolation, RBAC, and realtime correctness are *proven*, not asserted by hand —
and (b) a user can work through a full day in without hitting a missing basic
feature. "Done" for the initiative = Theme A fully shipped + Theme B shipped +
Theme C resolved (built or cut). Theme D is post-parity hardening.

## Non-Goals

- Rebuilding the architecture — the foundation (event-sourced analytics,
  drag-aware realtime, float-gap ordering, the harness) is sound and stays.
- Net-new differentiators beyond Trello parity (automation rules, power-ups,
  integrations marketplace) — out of scope for this initiative.
- Replacing `@hello-pangea/dnd` or the Server-Action-only write model.

## Risk Classification (intake)

Risk flags (aggregate across children):

- Auth — RBAC/session tests, board-level membership.
- Authorization — role-matrix proof, workspace isolation, board sharing.
- Data model — checklists, covers, stars, archive/restore, board membership.
- Audit/security — isolation proof, attachment hardening, operational logging.
- External systems — due-date scheduler, email triggers, Cloudinary.
- Public contracts — search/filter APIs, board-membership shape.
- Cross-platform — mobile/responsive board.
- Existing behavior — realtime contract, label propagation fix.
- Weak proof — the entire P0 theme exists because proof is weak.
- Multi-domain — boards, access, realtime, notifications all change.

Hard gates (force high-risk on the child story unless human narrows scope):

- Any auth or authorization change.
- Any data migration / new table / deletion-restore behavior.
- Any new external-provider behavior (scheduler, file scanning).
- Any change that weakens an existing validation requirement.

## Workstreams → Candidate Child Stories

IDs are reservations, not commitments — renumber freely when each is created.
Proposed epics in **bold**; create the epic dir when its first child is cut.

### Theme A — Trust & Safety (P0, blocks launch) → **E03-trust-and-safety**

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-006 | Server Action integration tests: auth + permission gate + workspace isolation on every mutation | high-risk | The core safety gap. Mock Prisma per existing test pattern; assert cross-workspace reads/writes are rejected. |
| US-007 | RBAC matrix tests — viewer/editor/admin allowed/denied per action | high-risk | Pairs with US-006; proves `hasWorkspacePermission` gating. |
| US-008 | CI pipeline with lint + typecheck + test gate on PRs | normal | `.github/workflows` is empty today; nothing gates merges. |
| US-009 | Two-client realtime E2E harness + cross-user sync proof | high-risk | The drag-aware deferral / self-echo invariants have single-client proof only. |
| US-010 | Fix cross-user label rename/delete requiring reload (socket propagation) | normal | Known US-005 limitation; close the accepted-but-broken state. |

### Theme B — Daily-use Parity (P1) → **E04-board-parity**

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-011 | In-board card filtering by label / assignee / due date | normal | Labels are inert without a filter to act on them. |
| US-012 | Card + board search | normal | Table stakes past a few dozen cards. Decide scope: in-board vs workspace-wide. |
| US-013 | Checklists — finish CRUD + enable the disabled UI | normal | Schema (`Checklist`/`ChecklistItem`) exists; UI button is disabled. Ship or remove. |
| US-014 | Archive/trash management UI with restore | normal | Soft-delete works but users have no way to recover archived items. |
| US-015 | Due-date reminder scheduler → trigger `DUE_DATE` notifications | high-risk | New external/scheduled behavior; `DUE_DATE` type exists but never fires. |
| US-016 | @mention parsing in comments → `MENTIONED` notifications | normal | `MENTIONED` type exists but never fires. |

### Theme C — Retire Half-built Schema (P1) → **E04-board-parity**

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-017 | Card priority UI (surface the `Priority` enum) | normal | Decide: surface it or cut the enum. |
| US-018 | Card cover images (`coverImage`) | normal | Trello-signature visual; reuse Cloudinary path. |
| US-019 | Board favorites/stars UI (`BoardStar`) | tiny | Schema already there — quick win. |

### Theme D — Scale & Platform (P2, post-parity) → **E05-scale-and-platform**

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-020 | Card-list virtualization → DnD INP <200ms on large boards | high-risk | US-004 left residual at ~435ms; virtualization is the deferred lever. |
| US-021 | Mobile / responsive board | normal | No responsive story today; large share of kanban usage is mobile. |
| US-022 | Board-level membership + shareable/public boards | high-risk | Access is workspace-only; Trello separates board members. |
| US-023 | Attachment hardening — file-type/size validation, scanning, orphan cleanup | high-risk | Untrusted upload path. |
| US-024 | Operational readiness — error monitoring, rate limiting, structured logging | normal | No observability story today. |
| US-025 | Bulk operations / card duplication / templates | normal | Power-user parity; genuinely last. |

## Recommended Sequencing

1. **Theme A first.** It is the difference between a demo and a product, the
   fixes are cheap per hour, and every later story is safer to build on a tested
   boundary. Suggested start: US-008 (CI gate) → US-006 + US-007 (boundary +
   RBAC proof) so the gate has teeth immediately.
2. **Theme B** — the biggest felt gap between "a kanban app" and "one people use
   daily." US-011 + US-012 first.
3. **Theme C** — resolve the half-built features (build or cut) to stop shipping
   schema without a surface.
4. **Theme D** — scale and platform once trust and parity hold.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — search, filter, checklists, priority,
  covers, archive/restore.
- `docs/product/workspaces-and-access.md` — RBAC proof, board-level membership.
- `docs/product/realtime-sync.md` — two-client proof, label propagation fix.
- `docs/product/notifications.md` — due-date scheduler, @mentions.
- `docs/TEST_MATRIX.md` — every Theme A story must move a row from planned/manual
  to proven.

## Decomposition Guidance (for the next agent)

- Pull **one** candidate row, run it through `docs/FEATURE_INTAKE.md`, and create
  its story artifact: a single file from `docs/templates/story.md` for
  normal/tiny, or a folder from `docs/templates/high-risk-story/` for high-risk.
- Record durable status with `scripts/bin/harness-cli story add` then
  `story update` for proof booleans.
- High-risk children (auth, data migration, external provider, contract change)
  **must** record a `docs/decisions/NNNN-*.md` decision before implementation.
- Update the relevant `docs/product/*` doc and `docs/TEST_MATRIX.md` as part of
  each child — not as a follow-up.

## Harness Delta

- New artifact location `docs/stories/initiatives/` introduced for umbrella notes
  (intake's "New initiative" artifact type had no home yet).
- Proposes new epics `E03-trust-and-safety`, `E04-board-parity`,
  `E05-scale-and-platform`; create each dir when its first child story is cut.

## Evidence

Initiative-level proof is the union of its children's proofs. The initiative is
"done" when Themes A + B are shipped with proof rows in `docs/TEST_MATRIX.md` and
Theme C items are each either shipped or explicitly cut via a decision record.
