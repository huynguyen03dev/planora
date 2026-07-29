# 0027 First-Party Usage Telemetry Privacy and Retention Boundary

Date: 2026-07-28

## Status

Proposed — gates implementation of story **US-076** (First-Party Usage Telemetry Baseline).

## Context

Planora's core product target is daily-use retention for small product and engineering teams (3–20 members). To measure whether features like Today/My Work, Quick Capture, and Automation achieve daily habit retention, product managers need product-usage data.

However, incorporating third-party analytics SDKs (such as Google Analytics, Mixpanel, Segment, or PostHog) introduces major privacy, security, and compliance risks:
- Transmitting user activity, board titles, or card metadata to third-party servers violates user data sovereignty.
- Client-side tracking scripts increase page weight, degrade performance, and are frequently blocked by ad/tracker blockers.
- PII (emails, names, IP addresses) can easily leak into third-party event payloads.

To measure product health responsibly, Planora requires a first-party usage measurement baseline with a clear privacy and retention contract.

## Decision (Proposed)

1. **100% First-Party Telemetry:** Usage measurement is executed entirely within Planora's server infrastructure and database. Zero third-party analytics SDKs, tracking pixels, or external telemetry domains.
2. **Zero PII by Default:**
   - Event payloads record only categorical event types (e.g. `today_view_opened`, `quick_capture_submitted`, `card_moved`, `rule_executed`), anonymized or hashed `workspaceId`, `userId` hash, and timestamp.
   - Text content (card titles, descriptions, comments, list names, custom values) is **never** included in usage telemetry events.
3. **Bounded Rolling Retention Window:**
   - Raw usage event logs are stored in a dedicated, lightweight table with a strict rolling retention policy (default: 90 days).
   - An automated background cleanup job prunes raw event rows older than 90 days after aggregating daily usage summaries (e.g. DAU per workspace, feature usage counts).
4. **Transparent Governance & Opt-Out:**
   - Workspace admins are provided with a setting in Workspace Settings to view usage stats or disable usage telemetry collection for their workspace entirely.
   - Telemetry event emission runs asynchronously out of the main request path to ensure zero impact on user interaction latency.

## Alternatives Considered

1. **Adopt an External SaaS Provider (e.g. PostHog / Mixpanel):** Rejected — Violates privacy-first principles, requires sending workspace activity to third parties, and introduces external script dependencies.
2. **Rely Solely on Existing Card History Events:** Rejected — `CardHistoryEvent` records card domain mutations (create, move, complete), but cannot measure read surfaces or non-mutation user interactions (such as opening the Today view or triggering quick capture).

## Consequences

Positive:
- Complete privacy compliance and data sovereignty (no third-party data sharing).
- Accurate measurement of daily active users (DAU) and feature adoption for ICP teams.
- Performance overhead is minimized via server-side asynchronous logging.

Tradeoffs:
- Requires storing and managing a first-party event table in PostgreSQL.
- Requires maintaining a retention pruning job.

## Follow-Up

- Story: US-076 (First-party product-usage measurement baseline).
- Gates: Must be accepted before US-076 code changes begin.
