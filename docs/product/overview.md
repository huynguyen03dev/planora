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
- No E2E test coverage or CI test gate yet.
- `/profile` is a placeholder.
