# Exec Plan — US-081 Card Templates Standalone Vertical Slice

## Goal

Build a standalone vertical slice for Card Templates, allowing workspace members to create templates and instantiate new cards with pre-filled descriptions, checklists, and labels.

## Scope

In scope:
- Decision ADR resolution for Data Model (Option A vs Option B).
- Schema additions & Prisma migration for Template model.
- Server Actions: `createCardTemplateAction`, `updateCardTemplateAction`, `createCardFromTemplateAction`.
- UI: Template selector modal, Template creation dialog, "Create from Template" menu item.
- Unit & integration tests for template cloning.

Out of scope:
- Recurring schedules (deferred to US-082).
- Cross-workspace template sharing.

## Risk Classification

Risk flags:
- `data_model`: New database tables/fields for templates.
- `public_contracts`: New instantiation API contracts.
- `existing_behavior`: Card creation flow extension.

Hard gates:
- Data model addition -> High-Risk lane.
- Requires resolving Data Model Decision Gate before coding.

## Work Phases (Planned)

1. **Intake & Decision Gate Resolution:** Choose between Option A (dedicated table) vs Option B (`isTemplate` flag) and record ADR.
2. **Schema & Migration:** Add template entities to `prisma/schema.prisma` and run migration.
3. **Server Actions & Logic:** Implement template CRUD and `createCardFromTemplateAction` transaction body.
4. **Integration & Cloning Tests:** Assert template cloning preserves checklists, checklist items, labels, and positions.
5. **UI Surface Implementation:** Add "Create from Template" dialog, template preview, and template management panel.
6. **Verification:** Run test suite, Playwright E2E verification, update harness proof rows.

## Stop Conditions

Pause implementation and surface to human if:
- Schema choice between Option A and Option B remains unresolved.
- Cloning complex checklists causes transaction timeouts or position conflicts.
