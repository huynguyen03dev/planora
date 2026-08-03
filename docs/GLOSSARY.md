# Glossary

Shared terms for Planora. **Product terms** name the domain concepts that own
stable contracts; **Harness terms** name the operating-model concepts.

---

## Product Terms (Planora)

### Workspace

The top-level organization unit and tenancy boundary. Maps to Better Auth's
`organization` (model `Workspace`, table `workspace`). Owns boards, members,
invitations, activity, and analytics settings. Has a unique `slug`, a
`timezone` (for analytics), and policy flags like `requireEstimateBeforeDone`.

### Workspace Member

A user's membership in a workspace with a `role` (`admin`, `editor`, `viewer`).
Maps to Better Auth's `member` (model `WorkspaceMember`). Unique per
`(organizationId, userId)`.

### Role

The RBAC level on a workspace membership. `admin` = full control,
`editor` = content CRUD (no board delete / member management),
`viewer` = read + comment only. Defined in `lib/permissions.ts`, enforced via
`lib/authorization.ts`.

### Invitation

A pending email-based offer to join a workspace at a given role, with an expiry
and `status`. Sent via Resend using the `emails/invite-email.tsx` template.

### Board

A kanban board inside a workspace (model `Board`). Has lists, labels, stars, an
optional `backgroundColor`, a creator, and `archivedAt` (soft delete).

### List

An ordered column on a board (model `List`). Ordered by `position Float`,
unique per `(boardId, position)`. Lists carry no completion flag — completion is
card-owned (`Card.completedAt`, set by the completion toggle), not derived from
the column (decision 0020).

### Card

A work item inside a list (model `Card`). Carries title, description, `priority`
(`URGENT|HIGH|MEDIUM|LOW`), `dueDate`, `estimateHours`, `completedAt`, cover
image, members, labels, checklists, comments, attachments. Ordered by
`position Float`; soft-deleted via `archivedAt`.

### Board Star

A user's "favorite" marker on a board (model `BoardStar`), unique per
`(boardId, userId)`.

### Label

A named, colored tag scoped to a board (model `Label`), attached to cards via
the `CardLabel` join.

### Checklist / Checklist Item

A titled checklist on a card (model `Checklist`) holding ordered
`ChecklistItem`s with `isCompleted` flags. Both order by `position Float`.

### Card Member

An assignee on a card (model `CardMember`, composite key `(cardId, userId)`).
Assignment can trigger a notification + email.

### Activity

A workspace-scoped audit entry (model `Activity`) recording an
`action` (CREATED, UPDATED, MOVED, ARCHIVED, RESTORED, DELETED, COMMENTED) on an
`entityType` (BOARD, LIST, CARD, COMMENT, MEMBER, LABEL, CHECKLIST, ATTACHMENT).
Board/card references use `SetNull` so the log survives deletion.

### Card History Event

An append-only analytics event (model `CardHistoryEvent`) with a monotonic
`sequence`. `boardId`/`cardId` are denormalized (not FKs) so the trail survives
entity deletion. Drives the analytics engine. Never mutate or delete these.

### Position (Float Gap Ordering)

The fractional ordering scheme (gap `16384`) used by lists, cards, checklists,
and checklist items. Insert at the midpoint of neighbours; normalize on overflow.
See `lib/dnd/apply-drop.ts`.

### Drag-Aware Deferral

The real-time rule that defers **structural** remote socket events (move/create/
delete/archive) while a local drag is in progress, applying in-place events
(comments, title, card completion, labels/members) live, then resyncing on drop.
Prevents drag corruption.
See `board-store-provider.tsx` and `tests/board-store.test.ts`.

### Analytics Launch Boundary

The `analyticsLaunchAt` timestamp marking the post-backfill cutoff. History
before it is lower-confidence; the engine flags metrics that cross it.

### Notification

A per-user alert (model `Notification`, type ASSIGNED, MENTIONED, DUE_DATE,
COMMENT, INVITE) delivered in-app, by email, and over a user socket room.

---

## Harness Terms

### Agent

An AI coding collaborator operating inside the repository.

### Harness

The repo-level operating system that tells humans and agents how to turn intent
into safe product changes.

### Product Contract

The current expected behavior of the product. Product docs plus executable tests
become the living contract once implementation exists.

### Story Packet

A story-sized work file or folder that describes the product contract, affected
docs, design notes, and validation expectations for a feature.

### Feature Intake

The classification step that turns a prompt into tiny, normal, or high-risk
work before implementation begins.

### Component Taxonomy

A map from Harness files and capabilities to the responsibilities they serve,
used to evaluate coverage, attribute failures, and identify missing capabilities.

### Maturity Level

A verifiable stage in Harness capability, from H0 bare environment through H5
self-improving harness.

### Trace Quality Tier

The expected depth of a task trace: minimal for tiny work, standard for normal
work, and detailed for high-risk work.

### Verification Gate

An advisory Harness check that runs or inspects mechanical proof before a task
is closed (`story verify`, `story verify-all`, `trace --story`).

### Tool Registry

The compiled and registered tool manifest exposed by
`scripts/bin/harness-cli query tools` and documented in `docs/TOOL_REGISTRY.md`.
It lets agents discover available commands, responsibilities, and project tools.

### Intervention

A durable record of human, reviewer, CI, or agent feedback that corrected,
overrode, escalated, or approved work, stored separately from traces.

### Context Score

The advisory result from `scripts/bin/harness-cli score-context <trace-id>`,
comparing a trace's recorded reads against compiled context rules.

### Entropy Score

The drift score from `scripts/bin/harness-cli audit`. Lower is better; it counts
stale or incomplete durable records.

### Improvement Proposal

A structured recommendation generated by `scripts/bin/harness-cli propose` from
repeated friction, interventions, and audit findings. Advisory unless committed
with `--commit`.

### Context Phase

A phase of an agent task that changes what context should be read: intake,
planning, implementation, validation, or trace recording.

### Retrieval Trigger

A condition that tells an agent to fetch additional context, such as touching a
database schema or changing a public contract.

### Harness Delta

A documentation, template, validation, backlog, or decision update that makes
future agent work safer or easier.

### Durable Layer

The SQLite database and CLI (`scripts/bin/harness-cli`) that store operational
records (intakes, stories, decisions, backlog items, traces) as queryable data.

### Product Delta

A product-facing change such as code, tests, API shape, data model, or product
documentation.

### Trace

A structured record of what an agent did during a task: actions, files read,
files changed, decisions, errors, outcome, and any harness friction discovered.
