# Overview — US-081 Card Templates Standalone Vertical Slice

## Status

planned (high-risk) — implementation unstarted. Data model unresolved (Decision Gate inside packet).

## Current Behavior

Currently, creating a card in Planora requires entering title, description, priority, due date, checklists, and labels from scratch every time.

There is no concept of a "Card Template" or reusable card definition. Teams performing repetitive workflows (e.g. "Bug Report", "Feature Spec", "Weekly Release", "Employee Onboarding") must manually recreate identical descriptions, checklist items, and label configurations on every new card.

## Target Behavior

Introduce reusable Card Templates as a standalone vertical slice:

1. **Template Definition:** Workspace members can create and edit Card Templates containing pre-configured titles, description skeletons, priority, labels, checklist structures, and assigned member roles.
2. **Template Instantiation:** Users can instantiate new cards from a template via the Card Creation menu or Quick Capture, automatically cloning the pre-defined title, description, checklists, and labels into an ordinary active `Card`.
3. **Template Management Surface:** A "Templates" manager in the board header / workspace settings where templates can be created, updated, previewed, and archived.

## Affected Users

- **Workspace Members (Editors & Admins):** Create templates, instantiate cards from templates, manage template library.
- **Workspace Viewers:** Instantiation and template creation denied.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — document Card Template model, creation flow, and instantiation semantics.
- `docs/TEST_MATRIX.md` — update matrix proof status.

## Future Decision Gate (Inside Packet)

**Data Model Design Gate (Unresolved):**
- **Option A (Dedicated Schema Tables):** Create dedicated `CardTemplate`, `TemplateChecklist`, and `TemplateChecklistItem` tables. Clear separation between template definitions and active cards.
- **Option B (Designated Flag on Card Model):** Add `isTemplate: Boolean` to `Card` model. Templates are special ordinary cards stored in an internal system list. Simpler schema, reuses existing card relations, but risks mixing template rows with active board cards.
*This decision gate MUST be evaluated and recorded in a decision ADR before US-081 implementation begins.*

## Non-Goals

- Recurring schedule execution (handled separately by US-082).
- External template marketplace or public template sharing.
- Cross-workspace template sync.
