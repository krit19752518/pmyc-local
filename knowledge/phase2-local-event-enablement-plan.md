# Phase 2 Local event persistence enablement

Status: applied to the working Local database after explicit user approval; Local restarted and read-only readiness passed. Authenticated user acceptance pending.

## Confirmed scope

Phase 1 and Phase 2 share the existing Local database. Phase 1 remains the team/player/official source. New events may reuse the same source team IDs; competition rosters retain the existing immutable participation snapshots. Each event owns its divisions, competitions, draws, fixtures and results. Closing one event must not prevent selecting eligible Phase 1 teams for a new event. The existing approval, division, area and Demo filters remain in force. This does not implement a new self-service event enrollment screen.

## Read-only preflight

`node scripts/phase2-local-setup.cjs --check` verified the configured PostgreSQL server is loopback, its database matches the Local launcher configuration, Phase 1 source tables exist, and public Phase 2 tables do not exist. No credential values or live team records were emitted. The Phase 2 database enablement marker is absent.

## Exact proposed change

- Apply [`../sql/phase2-local-bootstrap.sql`](../sql/phase2-local-bootstrap.sql) to the same Local database: 21 new `p2_*` tables, supporting constraints/indexes, and three template metadata rows.
- SQL SHA-256: `4e9af05e7b6865d3592e830234be0a633bbbc7ad1074c0284a33a4e8a0ff0eae`.
- No existing Phase 1 table alteration, team/player/official inserts, sporting-rule approval, event creation, roster import or draw execution in the working database.
- Create the private Local Phase 2 target marker using the same verified target as the Local launcher. Marker contains target identity only, no connection URL or credentials.
- Restart only the verified Local port4500 process using `npm run dev:local`; then inspect runtime readiness and have the user create/review their own Demo event.
- Production and external Git state are outside this change.

After task-specific approval, the apply command is:

```sh
node scripts/phase2-local-setup.cjs --apply 4e9af05e7b6865d3592e830234be0a633bbbc7ad1074c0284a33a4e8a0ff0eae
```

The helper checks file hash and loopback identity again. It refuses an existing marker or Phase 2 schema. SQL runs in one transaction. It never executes during application startup. If execution fails after a write attempt, reconcile actual schema/marker state before any follow-up; do not blindly rerun or delete tables. Preserve any committed records.

## Verification and limitations

The PostgreSQL integration fixture tests successful create/redirect, idempotent retry, preview with no writes, CSRF/role/input guards, unavailable schema, Phase 1 Demo team ID reuse, draw/fixture creation, Dashboard projection, and closing one event then reusing teams in another without mixing fixtures. Bootstrap refuses an existing schema. Tests use only synthetic data in a private temporary cluster; they do not establish authenticated browser acceptance of the working Local database. Other existing Phase 2 workflows are not all exercised by this focused test.

The approved implementation plan explicitly required presenting missing schema changes before applying them. The user subsequently explicitly approved the 21 tables, three templates and Local restart; the exact operation above has completed. Do not rerun the bootstrap on the initialized database.

Completed checks: focused PostgreSQL integration 7/7; full Jest 943/943 across 61 suites; incident retrieval 32/32; TypeScript build, PHP syntax, setup-helper syntax and `git diff --check` passed. The full Jest run required approved escalation after sandbox `listen EPERM`; the failed sandbox run is not counted as passing evidence.

## Applied Local evidence

The hash-bound helper returned `COMPLETE`: schema and private target marker created. A separate read-only check found exactly 21 public Phase 2 tables, three templates and no Demo event created by setup. The verified old Local process was stopped and `npm run dev:local` started a new listener. Source connection forwarding accepted the target marker. PHP rendered a valid review under a read-only transaction with `creation_ready=true`, HTTP-style status200, enabled confirmation form, and zero event writes. A request to the actual Local `/platform/events/new` returned302 to the login flow. This is readiness evidence, not authenticated browser acceptance. No team/player source data was changed or new event seeded by the setup operation.
