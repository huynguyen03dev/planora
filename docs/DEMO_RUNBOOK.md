# Planora Demo Runbook

US-083 uses one reserved, tool-owned workspace for repeatable demo data. The
workflow never creates users, changes `emailVerified`, truncates the database,
or deletes an arbitrary workspace.

## Prerequisites

1. Start PostgreSQL and Mailpit with the repository's normal local setup.
2. Create the owner and collaborator through Planora's real sign-up flow.
3. Open both real verification links from Mailpit. Both users must be verified
   before the fixture command will proceed.

The two accounts must be different. The owner is assigned `admin`; the
collaborator is assigned `editor` in the reserved demo workspace.

## Seed

```bash
npm run demo:seed -- \
  --owner-email owner@example.com \
  --collaborator-email collaborator@example.com
```

The command creates `planora-us083-demo` with a repeatable logical shape and
writes `.demo/fixture-manifest.json`. UUIDs may change between runs; the manifest
contains the IDs for the current run.

Re-seeding replaces an earlier workspace only when its reserved slug and strict
US-083 ownership marker both match the same two verified users. A colliding
workspace without that marker is left untouched and the command fails closed.

## Reset

```bash
npm run demo:reset -- \
  --owner-email owner@example.com \
  --collaborator-email collaborator@example.com
```

Reset deletes only the marked reserved workspace and removes the local manifest.
It refuses a missing or mismatched marker. Users and unrelated workspaces are
never deleted.

## Repeatability Contract

Repeatability means the same board/list/card titles, counts, assignments, roles,
and relative due dates. It does not require stable database UUIDs. A safe
rehearsal is:

1. `demo:seed`
2. inspect `.demo/fixture-manifest.json`
3. `demo:reset`
4. `demo:seed` again
5. compare `logicalShape` and the logical titles, not UUID values

The stale-server policy for Playwright is tracked separately in US-083 W3 and
must be completed before W3 closes.
