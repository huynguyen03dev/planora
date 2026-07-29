# Product Overview

Planora is a **Trello-like project-management app**: teams organize work on
kanban boards, collaborate in real time, and track delivery through a workspace
analytics dashboard.

## Who uses it

Members of a **workspace**, each holding a role: `admin`, `editor`, or `viewer`.
Access to every board, card, and action is scoped to the member's workspace and
gated by their role.

## Core hierarchy

```text
Workspace
  └─ Board
       └─ List            (ordered column; carries no completion flag)
            └─ Card        (the work item; completion is card-owned via completedAt)
                 ├─ Members (assignees)
                 ├─ Labels
                 ├─ Checklists → items
                 ├─ Comments
                 └─ Attachments
```

## Primary surfaces (routes)

| Route | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/sign-in`, `/sign-up` | Email + password auth |
| `/boards` | All workspaces and their boards for the current user |
| `/boards/[boardId]` | The kanban board: drag-and-drop lists and cards |
| `/today` | Personal focus dashboard: cross-board read-only view of assigned work (US-077) |
| `/workspace` | Member management and invitations |
| `/workspace/[slug]/dashboard` | Analytics dashboard (burndown, lead time, KPIs) |
| `/notifications` | The user's notifications |
| `/invitations` | Workspace invitations received by the user |
| `/profile` | Profile (placeholder) |

## What makes it more than a clone

- **Real-time collaboration** — board changes broadcast to other viewers over
  Socket.io, with a drag-aware rule that keeps drag-and-drop from corrupting
  (see `realtime-sync.md`).
- **Delivery analytics** — an append-only card-history event stream powers a
  workspace dashboard with burndown, lead time, overdue, reopen rate, and
  estimation coverage (see `analytics.md`).
- **Estimation discipline** — optional `requireEstimateBeforeDone` workspace
  policy; estimates lock after a card's first completion.

## Non-goals / not built yet

- No public/REST API for data (mutations are Next.js Server Actions only).
- No external email or public form intake (explicitly deferred per Decision 0028).
- `/profile` is a placeholder.

## Product Roadmap (Initiative IN-04: Daily Work & Structured Intake)

Planora's accepted roadmap focuses on daily-use retention for small product and engineering teams (3–20 members):
1. **Foundation & Data Safety:** Safe list lifecycle (US-074), automation rule failure isolation (US-075), and first-party usage telemetry (US-076).
2. **Personal Focus:** Today / My Work read-only cross-board view (US-077).
3. **Structured Intake & Triage:** Global quick capture (US-078) and per-board capture/triage lists (US-079) using first-class cards.
4. **Advanced Workflows:** Automation trigger expansion (US-080), standalone card templates (US-081), and recurring cards (US-082).
