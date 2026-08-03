# US-060 Resolve the dead app/proxy.ts edge-auth shim

## Status

implemented

## Lane

normal — touches **Auth (edge)**, but the recommended resolution is a *delete* of
dead code with no behavior change (route protection already runs server-side via
`verifySession`). *Activating* edge auth is deliberately out of scope and would be
a separate high-risk story. Surfaced by the deep review + validation (verified
2026-06-30).

## Product Contract

The repo contains no dead module that implies edge-level auth protection which
never runs. Route protection remains via `verifySession` in the server layer;
any edge gate that exists is actually wired.

## Relevant Product Docs

- `docs/ARCHITECTURE.md` — request/auth flow (`verifySession` gating).
- `docs/product/workspaces-and-access.md` — access control.

## Acceptance Criteria

- `app/proxy.ts` is resolved to one of:
  - **(recommended) Deleted** — it is dead: it exports `proxy()` + `config.matcher`
    but sits at `app/proxy.ts`, and Next 16 only auto-runs a **root** `proxy.ts`
    (the renamed middleware convention); nothing imports it (verified). Pages are
    already protected by `verifySession` (`lib/dal.ts`), so deletion changes no
    behavior; **or**
  - **Moved to root `proxy.ts`** to actually enforce the signed-out → `/sign-in`
    redirect at the edge — but this *activates* new auth behavior and must instead
    be split out as its own **high-risk** story (Auth hard gate) with a decision
    record and E2E proof. Not done under this (normal) story.
- The choice (delete vs. activate-later) is recorded in this story's Evidence.

## Design Notes

- `app/proxy.ts` is a correct Next-16 `proxy()` (signed-out redirect over
  `publicRoutes`) but one directory too deep — Next resolves the proxy/middleware
  file at the project root (or `src/`), not inside `app/`.
- No importer exists (grep across `app/`, `components/`, `lib/`, `server.ts`,
  `next.config.ts`). The only `verifySession`-independent auth gate the author
  intended never executes.
- Default action = **delete** (lowest risk, no behavior change). Flag activation
  as a follow-up high-risk story if defense-in-depth edge auth is wanted.

## Dependencies

- Independent.

## Validation

`scripts/bin/harness-cli story update --id US-060 --unit 0 --integration 0 --e2e 0 --platform 1`

| Layer | Expected proof |
| --- | --- |
| Unit | n/a. |
| Integration | n/a. |
| E2E | n/a for delete. (If activation is chosen later: signed-out request to a protected route → redirect to `/sign-in` — that proof belongs to the separate high-risk story.) |
| Platform | `npm run build` + `npm run lint` clean after removal; `grep` confirms no dangling import of `proxy`; app still gates protected pages via `verifySession`. |
| Release | Manual: signed-out user hitting a protected route is still redirected (by `verifySession`), confirming no protection was lost. |

## Harness Delta

None.

## Evidence

- **Decision: deleted** `app/proxy.ts` (the recommended, lowest-risk option).
  Re-verified before deletion: `grep -rn "proxy"` across `app/`, `components/`,
  `lib/`, `server.ts`, `next.config.ts` found no importer of the module (the
  only other hit was an unrelated Prisma-generated symbol). Route protection is
  unchanged — pages still gate via `verifySession` (`lib/dal.ts`).
- Activation (moving it to root `proxy.ts` to enforce edge-level auth) remains
  out of scope, deferred to a future high-risk story per the Acceptance Criteria.
- `npm run build` and `npm run lint`: see PR CI / commit for results.
