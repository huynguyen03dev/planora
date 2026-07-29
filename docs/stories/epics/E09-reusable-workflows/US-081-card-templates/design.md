# Design — US-081 Card Templates Standalone Vertical Slice

## Domain Model

- **Template Entity Concept:**
  - Holds template `title`, `description`, default `priority`, `boardId` or `workspaceId`.
  - Holds template checklist definitions (ordered checklist names and item titles).
  - Holds default label IDs.
- **Instantiation State Machine:**
  - `Template` ──(instantiateCardFromTemplateAction)──> `New Ordinary Card` (with cloned checklists & labels).

## Application Flow & Server Actions

1. `createCardTemplateAction({ boardId, title, description, priority, labels, checklists })`:
   - Gated by `board:["update"]` permission (editors & admins).
   - Persists template definition.

2. `createCardFromTemplateAction({ templateId, targetListId, position, customTitleOverride })`:
   - Gated by `card:["create"]` permission.
   - Executes inside `db.$transaction`:
     a. Creates new `Card` row using template's title/description/priority.
     b. Clones template label associations into `CardLabel` rows.
     c. Clones template checklists and items into new `Checklist` and `ChecklistItem` rows.
     d. Records `CARD_CREATED_FROM_TEMPLATE` history event.
   - Emits `card:created` socket event and revalidates board.

## Data Model & Migration Concerns

- **Prisma Schema (Subject to Decision Gate):**
  - Option A: Add `CardTemplate`, `TemplateChecklist`, `TemplateChecklistItem` tables.
  - Option B: Add `isTemplate Boolean @default(false)` to `Card` table.
- Composite indexes on `[boardId, isTemplate]` or `[workspaceId]`.

## UI / Platform Impact

- **Card Creation Menu:** Add "Create from Template..." dropdown item.
- **Template Selector Modal:** Browse available templates with preview of description skeleton and checklist count.
- **Template Manager Dialog:** Edit existing templates or save an existing card as a template ("Save as Template").

## Observability & Audit

- Captures `CARD_CREATED_FROM_TEMPLATE` activity log with `templateId` metadata.
