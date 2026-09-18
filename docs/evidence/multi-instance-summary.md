# Multi-instance evidence

## Status: PASS

Implementation: `lib/realtime/scale.ts`, `server.ts`, `scripts/multi-instance-proof.ts`, `tests/redis-scale-proof.test.ts`, Redis service in `docker-compose.yml`.

Proofs:

```bash
NODE_ENV=test REDIS_URL=redis://localhost:56379 \
REDIS_KEY_PREFIX=planora:test npx vitest run tests/redis-scale-proof.test.ts
```

Result: **3/3 PASS** for shared presence, duplicate-user socket handling, distributed lock/window behavior.

Two independent app copies were started on ports 3101 and 3102 with Redis adapter/shared presence enabled. `npm run test:multi-instance` returned:

```text
PASS cross-instance Socket.IO event propagated through Redis without reload
```

The proof used one shared PostgreSQL database and one Redis instance. It is a local deployment proof, not production capacity testing. Distributed lock correctness assumes the configured TTL exceeds the scheduled task duration.
