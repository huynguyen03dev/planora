# Overview — US-076 First-Party Product-Usage Measurement Baseline

## Status

planned (high-risk) — implementation unstarted. Gated by Decision 0027 (Proposed).

## Current Behavior

Planora's current analytics engine (`lib/analytics/engine.ts`) calculates delivery metrics (burndown, lead time, throughput, overdue counts) by processing `CardHistoryEvent` records stored in the database.

However, Planora has no product-usage telemetry to measure non-mutation user interactions or daily habit retention:
- Cannot measure how often users open the "Today / My Work" view or use Global Quick Capture.
- Cannot track Daily Active Users (DAU) per workspace or measure retention curves for the 3–20 member target ICP.
- No infrastructure exists to log application usage events without relying on external third-party tracking scripts.

## Target Behavior

Establish a first-party, privacy-preserving usage measurement baseline to track roadmap feature adoption and daily retention:

1. **First-Party Telemetry Infrastructure:**
   - Client and server interactions log lightweight usage events to a dedicated internal store (`UsageTelemetryEvent`).
   - 100% first-party: zero third-party analytics SDKs, external APIs, or tracking pixels.

2. **Strict Privacy Boundary (Zero PII):**
   - Event payloads record event names (e.g. `today_view_opened`, `quick_capture_used`, `rule_created`), hashed/UUID `workspaceId`, `userId` hash, and timestamp.
   - Zero card titles, descriptions, comments, or personal text are ever captured.

3. **Rolling Bounded Retention:**
   - Raw event logs are stored with a strict rolling retention policy (default: 90 days).
   - Daily background cron prunes expired raw telemetry rows after rolling up aggregate stats.

4. **Adoption Dashboard:**
   - Provides workspace admins with high-level usage metrics (DAU, feature adoption) in the Workspace Analytics shell.

## Affected Users

- **Workspace Admins:** Access product usage retention metrics in workspace analytics; manage telemetry settings.
- **Product Managers / Engineers:** Access aggregate daily-use retention data to validate roadmap hypothesis.
- **All Users:** Protected by first-party zero-PII privacy boundary.

## Affected Product Docs

- `docs/product/analytics.md` — document first-party usage measurement baseline, privacy contract, and 90-day retention window.
- `docs/decisions/0027-first-party-telemetry-privacy-and-retention.md` — Decision governing telemetry boundaries.
- `docs/TEST_MATRIX.md` — update matrix proof status.

## Non-Goals

- External analytics SDK integrations (Google Analytics, Mixpanel, PostHog, Segment).
- Tracking user PII or card text content.
- Real-time stream processing infrastructure.
