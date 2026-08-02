# IN-04 Daily Work & Structured Intake

## Status

in progress — US-083 Stage 1 (W1–W5) landed 2026-08-02 (realtime proof, live invite badge, demo determinism, retention/tracker reconciliation; W4/W5 uncommitted on the feature branch); Stage 2 (W6–W8) pending. Roadmap accepted; backlog and intake artifacts materialized.

**Update (2026-08-01):** owner locked the roadmap combination as a **single high-risk story, US-083 "Demo-ready daily work loop"** (not an IN-05 initiative), delivered as the owner's **Stage 1 (foundation/demo reliability)** then **Stage 2 (daily-work UX)** — delivery stages distinct from IN-04's numbered phase diagram below (US-083 spans the Phase 2/3 areas). US-083 fully absorbs the planned behavior of US-077 (Today / My Work → W6) and US-078 (Global Quick Capture → W7); those child stories are **retired as separate work** — the full acceptance criteria remain authoritative in the retained packets and are incorporated by exact reference, so W6/W7 cannot close until every referenced AC maps to evidence. US-074/075/076/079–082 remain unchanged. Decision 0031 (bounded reversible undo) gates US-083 W8.

## Type

Initiative (umbrella). Decomposes into candidate child stories US-074 through US-083; each child enters `docs/FEATURE_INTAKE.md` on its own and gets its own lane assignment. US-083 is the single-story combination of the roadmap's foundation/demo-reliability and daily-work-UX delivery stages.

## Target ICP

Small product and engineering teams (3–20 members).
**Primary Success Target:** Daily-use retention (turning Planora into a daily-driver habit for small teams).

## Problem Statement

While Planora provides core kanban boards and real-time collaboration, user retention among small product/engineering teams is limited by three critical friction points:

1. **Lack of Daily Personal Focus ("Today / My Work"):** Team members must manually scan multiple boards and lists every morning to discover work assigned to them or due today, creating cognitive overhead and fragmented daily planning.
2. **High Friction Intake & Triage:** Incoming tasks, bugs, and action items cannot be captured quickly without navigating to specific board locations and filling out full forms. Team members default to external notes or chat messages instead of recording work directly in Planora.
3. **Unsafe Foundation & Workflow Friction:** Hard deletion of lists risks accidental data loss (`deleteListAction` hard-deletes entire column cascades), automation rules break silently when target lists/members are missing, repetitive tasks must be re-created manually, and product decisions lack usage telemetry to measure daily habit retention.

## Goal / Outcome

Establish a safe, high-velocity daily workflow and structured intake system that enables 3–20 member product/engineering teams to manage daily tasks seamlessly within Planora.

**Key Deliverables:**
- **Data Safety Foundation:** Safe list lifecycle (archive/restore + guarded permanent delete) and automation rule failure isolation.
- **Personal Productivity:** Cross-board "Today / My Work" read-only dashboard.
- **Frictionless Capture:** Global quick capture dialog and per-board capture/triage lists.
- **Workflow Automation:** Attribute-change automation triggers, standalone card templates, and template-based recurring card schedules.
- **Telemetry Baseline:** First-party, privacy-preserving usage measurement to track daily retention metrics.

## Ordered Dependency Graph

The initiative follows a strictly ordered roadmap sequence. Each phase builds upon the previous phase:

```text
Phase 1: Foundation & Data Safety
  ├─ US-074 (High-Risk): Safe list lifecycle (archive/restore + guarded permanent delete) [gated by Decision 0026]
  ├─ US-075 (Normal): Automation failure isolation & stale target handling [decision gate inside]
  └─ US-076 (High-Risk): First-party usage telemetry baseline [gated by Decision 0027]
      │
      v
Phase 2: Personal Focus
  └─ US-083 (High-Risk) W6: Today / My Work cross-board view (no new domain table)
      │  (absorbs retired US-077; ACs incorporated by exact reference)
      v
Phase 3: Fast Intake & Triage
  ├─ US-083 W7: Global quick capture using standard Card creation (no new capture entity)
  │   (absorbs retired US-078; ACs incorporated by exact reference)
  ├─ US-083 W8: Bounded undo snackbar — archive card/list only, via real restore actions (decision 0031)
  └─ US-079 (Normal): Per-board Capture / Triage lists using first-class Cards [escalation gate inside]
      │
      v
Phase 4: Advanced Workflows
  ├─ US-080 (Normal): Automation trigger expansion (due date, estimate, priority, stale capture)
  ├─ US-081 (High-Risk): Card templates standalone vertical slice [data model decision gate inside]
  └─ US-082 (High-Risk): Recurring cards built on templates [depends on US-081; scheduler/dedup gate inside]
```

## Scope & Not-Doing Constraints

- **Implementation is explicitly unstarted across all stories.** No code, schema migrations, or tests are created in this intake phase.
- **External Email & Public Form Intake is EXPLICITLY DEFERRED (Decision 0028 Accepted):** No email ingestion (`support@`/`tasks@`), public form endpoints, external webhooks, SLA engines, or third-party provider integrations (e.g. Zendesk, Jira, Typeform) in this initiative.
- **First-Class Ordinary Cards Only:** All captured items are standard `Card` entities. No new `Request` or `Ticket` entities, AI routing, or complex request-management layers.
- **No New Domain Table for Today / My Work:** US-077 is strictly a read-model query over existing `CardMember`, `dueDate`, `priority`, and `archivedAt` data across authorized boards.
- **No New Capture Entity for Quick Capture:** US-078 wraps existing `createCardAction` without creating a custom capture model.
- **First-Party Telemetry Only:** US-076 measures usage locally with zero external analytics providers (Google Analytics, Mixpanel, etc.) and zero PII by default.

## Decision Gates

| Decision | Status | Title | Gated Story |
| --- | --- | --- | --- |
| 0026 | Accepted | Safe list lifecycle and permanent deletion semantics | US-074 |
| 0027 | Proposed | First-party product-usage measurement privacy & retention boundary | US-076 |
| 0028 | Accepted | Defer external email/form intake until safety & operational prerequisites exist | External Intake Scope |
| 0031 | Accepted | Bounded reversible undo semantics (archive card/list only, via real restore actions) | US-083 W8 |
| Gate in US-075 | Future | Strict rollback vs Best-effort error isolation for automation rules | US-075 |
| Gate in US-079 | Escalation | If per-board triage requires schema addition (`listType`), escalate to high-risk | US-079 |
| Gate in US-081 | Future | Dedicated `CardTemplate` table vs designated ordinary card (`isTemplate: true`) | US-081 |
| Gate in US-082 | Future | Scheduler tick integration vs dedicated job runner for recurring cards | US-082 |

## Success Metrics & Telemetry

- **Daily Active User (DAU) Retention:** Percentage of workspace members opening the "Today / My Work" view at least 4 days/week.
- **Intake Speed:** Average time to record a new task via Global Quick Capture (< 5 seconds).
- **Data Loss Incidents:** Zero accidental data loss incidents from list deletion (verified by US-074 safe lifecycle).
- **Rule Failure Rate:** Zero unhandled rule execution crashes (monitored via `RuleExecutionLog` in US-075).
- **Template Adoption:** Number of recurring cards and template instantiations created per workspace per week.

## Workstreams & Child Stories

| ID | Title | Lane | Epic | Status |
| --- | --- | --- | --- | --- |
| US-074 | Safe list lifecycle — archive/restore plus guarded permanent deletion | high-risk | E03-trust-and-safety | done (PR #90) |
| US-075 | Automation rule failure isolation and stale-target handling | normal | E06-automation | implemented (PR #92, decision 0030; E2E not implemented) |
| US-076 | First-party product-usage measurement baseline for the roadmap | high-risk | E01-analytics | planned (unstarted) |
| US-077 | Today / My Work read-only cross-board view | normal | E08-personal-productivity-and-capture | **retired — absorbed by US-083 (W6)**; ACs retained in this packet, incorporated by exact reference |
| US-078 | Global quick capture using standard Card creation | normal | E08-personal-productivity-and-capture | **retired — absorbed by US-083 (W7)**; ACs retained in this packet, incorporated by exact reference |
| US-083 | Demo-ready daily work loop (W1–W8) | high-risk | E08-personal-productivity-and-capture | in progress (Stage 1 W1–W5 landed 2026-08-02 — W4/W5 uncommitted on the feature branch; Stage 2 W6–W8 pending) |
| US-079 | Per-board Capture/Triage using first-class Cards | normal | E08-personal-productivity-and-capture | planned (unstarted) |
| US-080 | Automation trigger expansion for card attribute changes | normal | E06-automation | planned (unstarted) |
| US-081 | Card templates as a standalone vertical slice | high-risk | E09-reusable-workflows | planned (unstarted) |
| US-082 | Recurring cards built on accepted templates | high-risk | E09-reusable-workflows | planned (unstarted) |
