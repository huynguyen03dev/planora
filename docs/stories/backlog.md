# Story Backlog

This backlog records active, planned, and candidate epics and stories across Planora.

## Active & Candidate Epics

| Epic | Description | Status |
| --- | --- | --- |
| E01-analytics | Workspace delivery analytics, burndown, lead time, and product usage telemetry baseline | active |
| E02-board-experience | Core board UI, card surfaces, design system conformance, and info density | active |
| E03-trust-and-safety | Security boundaries, RBAC matrix, workspace member isolation, and safe list lifecycle | active |
| E04-board-parity | Trello-style filtering, checklists, covers, board stars, and reminder scheduler | active |
| E05-scale-and-platform | Responsive/mobile board, virtualization, platform performance | active |
| E06-automation | Butler-style automation rules engine, failure isolation, and trigger expansion | active |
| E07-auth-onboarding-ux | Authentication accessibility, error handling, email verification, and mail sink | active |
| E08-personal-productivity-and-capture | Today/My Work cross-board view, global quick capture, and per-board triage lists | active (US-083 implemented branch-local 2026-08-02 — PR/merge pending; US-079 per-board triage still planned) |
| E09-reusable-workflows | Standalone card templates and automated recurring card schedules | planned |

## Planned Stories (Implementation Unstarted)

### IN-04: Daily Work & Structured Intake

| ID | Title | Epic | Lane | Status |
| --- | --- | --- | --- | --- |
| US-074 | Safe list lifecycle — archive/restore plus guarded permanent deletion | E03-trust-and-safety | high-risk | done (Slices A/B/B2/C verified — PR #90) |
| US-075 | Automation rule failure isolation and stale-target handling | E06-automation | normal | implemented (PR #92, decision 0030; E2E not implemented) |
| US-076 | First-party product-usage measurement baseline for the roadmap | E01-analytics | high-risk | planned (unstarted) |
| US-077 | Today / My Work read-only cross-board view | E08-personal-productivity-and-capture | normal | retired — absorbed by US-083 (W6); ACs retained in this packet, incorporated by exact reference |
| US-078 | Global quick capture using standard Card creation | E08-personal-productivity-and-capture | normal | retired — absorbed by US-083 (W7); ACs retained in this packet, incorporated by exact reference |
| US-083 | Demo-ready daily work loop (W1–W8: realtime proof, live invite badge, demo determinism, retention/tracker reconciliation, Today/My Work, quick capture, bounded undo) | E08-personal-productivity-and-capture | high-risk | implemented (branch-local, 2026-08-02 — all W1–W8 gates green incl. W3 round trip + continuous demo rehearsal, 375px platform proof, combined US-083 E2E 25/25, full E2E 36/36; harness row implemented; PR/merge is a separate authorization gate) |
| US-079 | Per-board Capture/Triage using first-class Cards | E08-personal-productivity-and-capture | normal | planned (unstarted) |
| US-080 | Automation trigger expansion for card attribute changes | E06-automation | normal | planned (unstarted) |
| US-081 | Card templates as a standalone vertical slice | E09-reusable-workflows | high-risk | planned (unstarted) |
| US-082 | Recurring cards built on accepted templates | E09-reusable-workflows | high-risk | planned (unstarted) |
