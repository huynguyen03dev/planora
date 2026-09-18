# Benchmark evidence

## Board benchmark — PASS

Command:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:55432/planora?schema=public' \
PERF_BASE=http://localhost:3100 PERF_INP_MAX_MS=500 PERF_LOAD_MAX_MS=3000 \
npm run perf:board
```

Three runs per size, CPU throttle 1x:

| Cards | Median INP | Median board load | Result |
|---:|---:|---:|---|
| 30 | 136 ms | 817 ms | PASS |
| 60 | 208 ms | 792 ms | PASS |
| 100 | 304 ms | 854 ms | PASS |
| 150 | 368 ms | 1,122 ms | PASS |

Thresholds: median INP <= 500 ms and median board load <= 3,000 ms.

## Realtime benchmark — PASS

Command:

```bash
PERF_SOCKET_CLIENTS=25 PERF_SOCKET_EVENTS=500 \
PERF_SOCKET_CONNECT_P95_MS=1000 PERF_SOCKET_MIN_MSG_S=1000 \
PERF_SOCKET_RSS_MAX_MB=128 npm run perf:realtime
```

Result: connect p95 **146.8 ms**, deliveries **12,500/12,500**, throughput **20,488 msg/s**, RSS delta **33.6 MB**; all thresholds PASS.
