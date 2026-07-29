# Design — US-076 First-Party Product-Usage Measurement Baseline

## Domain Model

- **Telemetry Event Entity:** `UsageTelemetryEvent`
  - `id`: UUID
  - `workspaceId`: String (FK to Workspace)
  - `userIdHash`: String (hashed user identifier)
  - `eventType`: Enum / String (`today_view_opened`, `quick_capture_created`, `board_viewed`, `rule_executed`)
  - `surfaceContext`: String (`today_page`, `global_shortcut`, `board_header`)
  - `createdAt`: DateTime
- **Aggregate Summary Entity:** `DailyUsageSummary` (rolled up count per workspace/day).

## Privacy & Anonymization Engine

- **PII Stripping:** Mandatory Zod validator strips any string fields matching PII patterns or card text content before persistence.
- **UserId Hashing:** User IDs are salted and hashed with `HMAC-SHA256(userId, secret)` so individual user actions cannot be reverse-engineered outside the workspace.

## Data Model & Migration Concerns

- **Prisma Schema Additions:**
  - `UsageTelemetryEvent` table with indexes `@@index([workspaceId, createdAt])` and `@@index([eventType, createdAt])`.
  - `DailyUsageSummary` table for long-term aggregated metrics.
- **Retention Pruning:**
  - Cron route `/api/cron/telemetry-prune` runs daily to remove `UsageTelemetryEvent` rows where `createdAt < now() - 90 days`.

## Application Flow

1. Client interaction (e.g. opening Today view) triggers lightweight `recordTelemetryAction({ eventType, surfaceContext })`.
2. Action verifies session, hashes `userId`, validates zero PII, and asynchronously inserts event row.
3. Errors during telemetry recording fail silently without affecting UI interaction or throwing errors to the user.

## UI / Platform Impact

- **Workspace Analytics Shell:** Add "Usage & Retention" tab for admins showing DAU charts and feature usage counts.

## Observability

- Audit logs verify telemetry emission and daily pruning job execution.
