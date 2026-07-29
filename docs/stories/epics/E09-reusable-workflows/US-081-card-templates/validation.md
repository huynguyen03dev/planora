# Validation Plan — US-081 Card Templates Standalone Vertical Slice

## Proof Strategy

Validation requires proving three layers:
1. **Cloning & Transaction Integrity:** Integration test asserting `createCardFromTemplateAction` atomically creates a `Card` and accurately clones all nested checklists, checklist items, and labels without duplicating IDs or losing ordering positions.
2. **Security & Authorization:** Server Action integration tests verifying viewer denial and cross-workspace isolation.
3. **E2E User Journey:** Playwright E2E test exercising Template Creation -> Instantiation -> Verification of created card on board.

## Test Plan

| Layer | Test Description | Target File |
| --- | --- | --- |
| Unit | Template payload validator and cloning helper | `lib/templates.test.ts` |
| Integration | `createCardFromTemplateAction` clones title, description, checklists, and labels | `tests/server-actions/templates.test.ts` |
| Integration | Security boundary (A1 auth, A2 viewer denied, A3 isolation) for template actions | `tests/server-actions/templates.test.ts` |
| E2E | User creates "Bug Template" with 3 checklist items, instantiates card on List 1, verifies card and items exist | `e2e/card-templates.spec.ts` |

## Acceptance Criteria Verification

- [ ] Creating a card from a template clones all title, description, label, and checklist data.
- [ ] Instantiated cards are ordinary `Card` entities and behave identically to standard cards.
- [ ] Viewers are denied template creation and instantiation.
- [ ] Modifying a template does not alter previously instantiated cards.

## Command Verification (Pre-Implementation Placeholder)

```bash
# Unit & Integration
npx vitest run tests/server-actions/templates.test.ts

# E2E
npx playwright test e2e/card-templates.spec.ts
```
