# Operations and security evidence

## Preflight — PASS

`npm run ops:preflight` with PostgreSQL 55432, Redis 56379, Mailpit, test auth secret, and Cloudinary variables: all required env, PostgreSQL query, Redis PING/PONG, Cloudinary configuration, and mail transport checks passed.

## Backup/restore rehearsal — PASS

`scripts/ops/backup-db.sh` created `.local-backups/planora-evidence.dump`. The dump was restored into a separate `planora_restore_rehearsal` database using `postgres:16-alpine` tools. Smoke query returned:

```text
planora_restore_rehearsal|10|6|5
```

These are restored counts for users, workspaces, and boards. The real test database was not overwritten.

## Cloudinary — DRY RUN only

`npm run ops:cloudinary:dry-run` connected successfully and reported 10 resources, 0 referenced records, and 10 orphan candidates. No delete was applied; manual review is required before `--apply`.

## npm audit — NOT CLEAR

`npm audit --json` returned exit 1 with **13 vulnerabilities**: 3 moderate, 7 high, and 3 critical. Framework versions remain pinned to `better-auth@1.5.5` and `next@16.2.9` per task scope; no audit fix upgrade was applied.

## Usability — protocol ready, participant data pending

`scripts/usability-study.ts` records task time, success/failure, error count, notes, and ease 1–5 to `docs/evidence/usability-study.jsonl`. No participant rows were fabricated.
