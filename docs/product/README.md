# Product Docs

Current product truth for Planora — a Trello-like, multi-workspace kanban app
with real-time collaboration and workspace analytics. Each file is the living
contract for one domain. When behavior changes, update the relevant file (and a
story packet + decision when warranted).

## Domains

- `overview.md` — what Planora is, primary surfaces, the core hierarchy.
- `boards-and-cards.md` — boards, lists, cards, labels, checklists, comments,
  attachments, drag-and-drop ordering.
- `workspaces-and-access.md` — workspaces, members, roles/permissions,
  invitations, authentication.
- `realtime-sync.md` — Socket.io live updates and the drag-aware deferral rule.
- `notifications.md` — in-app, email, and socket notifications.
- `analytics.md` — the workspace analytics dashboard and its metrics.

## Update Rule

When behavior changes:

1. Update the affected product doc here.
2. Update or create the story packet under `docs/stories/`.
3. Update durable proof status (`scripts/bin/harness-cli story add` / `story update`).
4. Record a decision (`docs/decisions/`) if architecture, scope, risk, auth,
   data ownership, API shape, or a settled product rule changes.
