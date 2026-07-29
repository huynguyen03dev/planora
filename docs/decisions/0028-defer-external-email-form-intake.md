# 0028 Defer External Email and Form Intake Until Prerequisites Exist

Date: 2026-07-28

## Status

Accepted — locked product decision for the roadmap (gated by IN-04).

## Context

In project management applications, users frequently request external intake channels:
1. **Email Ingestion:** Automatically creating cards when emails are sent to an inbound address (e.g. `support@workspace.planora.app` or `tasks@...`).
2. **Public Web Forms / External Webhooks:** Exposing unauthenticated or public form endpoints where external parties (clients, end-users) submit requests that become cards.

While appealing, introducing unauthenticated or external intake channels early in product development creates severe security, operational, and architectural vulnerabilities:
- **Spam & Denial of Service:** Public endpoints or email receivers without robust rate limiting can flood database tables with spam or malicious payloads.
- **Authentication & Spoofing:** Inbound emails require complex verification (SPF, DKIM, DMARC checks, inbound identity mapping) to prevent address spoofing and impersonation.
- **Lack of Background Infrastructure:** Webhook and email ingestion require asynchronous background job processing (queues, retry logic, dead-letter queues) to avoid blocking HTTP threads.
- **Entity Scope Inflation:** External intake requests often demand specialized "Request", "Ticket", or "SLA" domain entities, fragmenting the simple, elegant card-based domain model.

## Decision

1. **External Email and Public Form Intake are EXPLICITLY DEFERRED:** No inbound email ingestion, public submission forms, external webhooks, or third-party intake integrations will be implemented in current or near-term roadmap phases.
2. **First-Class Ordinary Cards Only:** Work intake in Planora is strictly restricted to authenticated workspace members operating within first-party interfaces (Global Quick Capture US-078, Per-Board Capture/Triage US-079, and standard board card creation).
3. **Hard Prerequisites for Re-evaluating External Intake:** External email or public form intake cannot be considered until ALL of the following prerequisites are proven and operational:
   - **Product Evidence:** Verified usage telemetry (US-076) proving active daily-use retention and explicit demand from established workspace teams.
   - **Rate Limiting & Abuse Protection:** Infrastructure for IP rate limiting, CAPTCHA/proof-of-work validation, token buckets, and payload size bounds.
   - **Inbound Security & Identity Mapping:** Verification infrastructure for email authenticity (SPF/DKIM/DMARC) and secure API token management for forms.
   - **Background Job Queue:** Asynchronous task processing architecture (e.g. Redis/BullMQ or worker queue) for off-thread processing, retries, and error isolation.
   - **Observability & Inspection:** Dedicated administrative logging, quarantine views, and audit tools for rejected/failed inbound submissions.

## Alternatives Considered

1. **Build a Basic Public Form Endpoint Now:** Rejected — High risk of spam, unthrottled database growth, and unauthenticated card creation without proper rate limiting.
2. **Use a Simple Server Action for Inbound Webhooks:** Rejected — Processing external HTTP payloads synchronously in Next.js Server Actions risks thread starvation and lacks retry/quarantine mechanisms.

## Consequences

Positive:
- Protects the database and application boundary from external spam, abuse, and denial-of-service vectors.
- Keeps the domain model simple and focused on first-class `Card` entities without entity bloat.
- Directs development effort toward high-value internal productivity tools (Today view, Quick Capture, Templates).

Tradeoffs:
- External users (non-workspace members) cannot submit requests directly into Planora boards without being invited as workspace members.

## Follow-Up

- Governs scope for IN-04, US-078, US-079, and US-080.
- No external intake stories will be accepted into intake until all five listed prerequisites are operational.
