# Test evidence

## Status

PASS for the component/unit baseline previously rerun; TypeScript and Redis integration proof also PASS.

## Proof

- Component baseline: `components/boards/card-detail-sheet.test.tsx` — before fix 1,722/1,728; after fix 1,728/1,728 across 112/112 files. Focused file: 45/45.
- TypeScript: `npx tsc --noEmit --pretty false` — PASS.
- Redis scale proof: `tests/redis-scale-proof.test.ts` — 3/3 PASS with real Redis at `localhost:56379`.

Commands:

```bash
npm test
npx tsc --noEmit --pretty false
NODE_ENV=test REDIS_URL=redis://localhost:56379 REDIS_KEY_PREFIX=planora:test \
  npx vitest run tests/redis-scale-proof.test.ts
```

Limitation: the 1,728-case full Vitest result is the recorded checkpoint from before the final Redis/workspace hardening patch and before the inherited dirty change to `lib/authorization.ts`. A later local `npm test` was not a valid replacement: the shell had `NODE_ENV=production`, and the explicit `NODE_ENV=test` rerun exposed 79 server-action failures because those tests still mock `auth.api.hasPermission` while the inherited authorization implementation calls `auth.api.getSession`. This ownership mismatch is left untouched and is not represented as a new product regression.
