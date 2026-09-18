# E2E evidence

## Status

PARTIAL but materially verified. The full Playwright run reached 28/39 PASS before the development server hit Node heap OOM; this is not reported as 39 product failures.

## Real results

Full command:

```bash
PORT=3000 NODE_ENV=test \
DATABASE_URL='postgresql://postgres:postgres@localhost:55432/planora?schema=public' \
SMTP_HOST=localhost SMTP_PORT=1025 npm run test:e2e
```

Result: **28 passed, 11 failed**, with the server terminating on JavaScript heap exhaustion. The later isolated reruns passed:

- `e2e/today.spec.ts` + `e2e/undo-snackbar.spec.ts`: **9/9 PASS** with `NODE_OPTIONS=--max-old-space-size=4096`.
- `e2e/attachment-lifecycle.spec.ts`: **1/1 PASS** against live Cloudinary; uploaded resource was cleaned up.
- `e2e/member-management.spec.ts`: focused run recorded PASS.

Coverage includes verification, workspace creation, RBAC/member flows, DnD, realtime, reconnect, automation, analytics, archive/restore/delete, attachment, and editor flows. The full-suite OOM remains a reproducibility limitation for one uninterrupted 39-test run.
