# [FOOTBALL] Event preview silently omits confirmation without Phase 2 persistence

- Incident ID: FOOTBALL-INC-2026-11-10-08
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-10
- Category: Local Phase 2 persistence readiness
- Source files: `phase2/src/Application.php`, `phase2/src/EventRepository.php`, `src/services/phase2Runtime.service.ts`, `tests/phase2-event-create.test.ts`
- Retrieval terms: phase2 event preview missing save confirmation database-enabled marker creationReady Local schema Phase1 team reuse

## Context / symptom

The event review form rendered successfully but did not show a confirmation action. Dashboard UI could be reviewed without persistence, which did not establish readiness to create events.

## Confirmed observations

Local preflight read only database identity and schema metadata. Phase 1 source tables exist; the explicit Phase 2 target marker and public Phase 2 tables are absent.

## Unknowns and hypotheses

No authenticated browser acceptance or exhaustive workflow verification has been performed for this prepared bootstrap. Existing Demo source records were not copied into diagnostic output.

## Confirmed cause

Application rendered the save form only for a non-null EventRepository. The Local PHP sidecar only forwards its database environment when its explicit target marker exists. Marker metadata inspection found it absent. An authorized read-only Local check separately found no public Phase 2 tables. Existing Demo source teams belong to Phase 1; they are not competition/draw/match records.

## Resolution / invariants

New/review pages now explain unavailable persistence. Review shows a disabled confirmation action with the reason, and only enables the existing save form after read-only table/template readiness checks. Connection errors do not expose driver details. Preview remains read-only; CSRF, role and idempotency protections remain intact.

An additive Local-only 21-table bootstrap and hash-bound explicit setup helper use the existing Phase 1 database and create no new team master records. The user explicitly approved adding the tables, three templates and restarting Local. The helper completed, an independent check confirmed the expected tables/templates, and the verified Local process was restarted through the standard launcher. This remains mitigated pending authenticated user acceptance.

## Impact and artifact state

Code, bootstrap and tests are Local worktree changes. The approved working Local database now has the Phase 2 schema and template metadata, and the Local connection marker is enabled. Production is outside scope.

## Regression checks

The focused integration fixture uses a disposable PostgreSQL cluster and synthetic Phase 1 rows. It verifies create/retry, no preview writes, direct-submit guards, source Demo team reuse, match generation, Dashboard totals, and independent events after closure. It does not verify every existing Phase 2 workflow or authenticated browser behavior.

After the approved setup, PHP rendered review against the working Local database inside an explicitly read-only transaction: readiness true, enabled confirmation form present, status200 and zero event writes. Actual port4500 returned302 to login for an anonymous new-event request. Setup did not create an event or import a roster. Prior full suite passed943/943, focused integration7/7, build passed.

Initial read-only searches included nonexistent guessed README/test paths (rg exit2); no writes occurred and subsequent reads used known paths. An initial multi-file apply_patch failed context verification; a read confirmed neither target changed before a smaller patch succeeded. The first integration fixture lacked its class autoloader and failed before creating application tables; its temporary cluster was stopped, then the fixture loader was corrected. Full Jest initially stopped with `listen EPERM: operation not permitted 0.0.0.0` inside the sandbox; that process exited and the test run was requested through the required escalation path. No hook lock was edited or bypassed.

## Follow-up / limitations

See [`phase2-local-event-enablement-plan.md`](phase2-local-event-enablement-plan.md) for the completed Local operation and limitations. Keep existing user data and prior event history. Do not infer that event creation alone imports teams or generates fixtures. Authenticated user acceptance remains pending; do not rerun initialization.

The first retrieval regression run rejected this new record with `incident sections are incomplete`; the record headings were corrected to the required incident template before rerunning retrieval. No operational state changed.
