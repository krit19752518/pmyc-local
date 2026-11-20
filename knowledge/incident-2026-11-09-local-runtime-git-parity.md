# [FOOTBALL] Local temporary runtime and parent Git diverged from Production

- Incident ID: FOOTBALL-INC-2026-11-09-09
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Category: Local source/runtime and Git boundary
- Source files: `src/`, `dist/`, `scripts/run-local.cjs`, `tests/production-parity.test.ts`, `.gitignore`
- Retrieval terms: permanent checkout UAT4573 residual evidence accepted revision  standalone Git Local4500 temporary entry production parity parent repository nested repository source runtime issue72 isolated worktree missing statistics menu active launcher promotion

## Context / symptom

The user reported Local pages and menus differing from the stable Production site after repository migration and selective releases. Football still resolved to the parent Git root, and saved Local4500 metadata referenced a temporary candidate entry instead of the main working folder.

## Confirmed observations

The working folder, saved Local candidate, Production checkout HEAD and deployed selective artifacts had separate identities. Production's three layout TypeScript files did not recreate their active JavaScript counterparts. Required Phase2 modules and code/assets were absent from the inspected Football Local roots. These are confirmed version/boundary differences; the provenance of every prior runtime edit remains unknown.

## Unknowns and hypotheses

Initial inspection calls returned inconsistent listener/process visibility. A later authorized host-side check confirmed the saved temporary candidate still held port4500. Do not infer an actual process exit, crash or operator action from the earlier missing-process result. The provenance of every historical runtime-only edit remains unknown.

## Confirmed cause

Local source, the saved temporary entry point and Production's active runtime represented different code bases. Production source/runtime drift also prevented a direct source copy and rebuild from preserving deployed behavior.

## Impact and artifact state

Local navigation and required Phase2 modules differed from Production. Prior Local code and the exact Production code snapshot were preserved privately before replacing the active Local code. Production runtime and operational data were not changed.

## Resolution / invariants

Recover maintained typed source from active runtime contracts before rebuilding. Keep Production unchanged and preserve prior Local code privately. Use one canonical Local entry point, a standalone Local Git boundary and a default-deny Git allowlist prepared before staging. Operational/user data must never be traversed or copied to make Git status clean.

The source/runtime reconciliation covers all51 modules with two explicit Local configuration exceptions: development-only skip-init and removal of the embedded database-password fallback. See [`local-standalone-git.md`](local-standalone-git.md) for the procedure and recovery boundaries.

## Regression checks

`tests/production-parity.test.ts` checks all51 Production contracts and strict-source/generated-output consistency. Role/menu, roster status, category transactions, public downloads and OCR mock tests retain separate behavioral coverage. `knowledge/test_search_incidents.py` includes a standalone-Git/temporary-entry retrieval case.

The first test run from the main folder also discovered93 suites inside private recovery copies because the former Jest pattern matched any nested tests folder. Maintained main suites passed, but the aggregate included stale backup failures. Jest now limits roots to src/tests and ignores .runtime; a regression checks that boundary. No backup test result is counted as a final main-suite pass.

## Follow-up / limitations

Checksums and source contracts establish code identity rather than equality of live data or authenticated browser acceptance. No Production schema/data change, paid OCR call or upload inspection is required for this mitigation. No lock file or hook configuration is modified; a blocked consequential operation must be reconciled before continuing.

## Permanent Local and revision boundary, 13 November 2026

The owner selected `/home/krit/my-office/pmyc-football` as the permanent GitHub-backed
source repository and `/home/krit/my-office/pmyc-football-work/issue72` as its feature
worktree. Original dirty Local work and recovery artifacts remain preserved. The owner
explicitly clarified that the Local PASS concerns synthetic UAT4573 prepared at
`22ddb3fe89508765ef175592c66db3394025d7f4`; it does not establish Local4500 or Production
acceptance, or acceptance of later cancellation/menu changes in other worktrees.

An evidence-review commit based on that feature is `cc523a5`. A separate governance branch
starts directly from main `e780093`, selecting documentation and retrieval regressions
without importing feature commits, source/runtime files, fixtures or cron source. Record
each branch's base and accepted revision before proposing a PR; the existence of reviewed
feature evidence does not authorize adding its ancestry to the governance PR.

[Revision/disposition record](issue3-local-governance-20261113.json) and
[Local handoff](../docs/ISSUE3_LOCAL_HANDOFF_20261113.md) identify the preserved work.
Historical Production comparison and test evidence keep their original dates. This task
performs no Production operation, runtime promotion, scheduler action or Local service switch.


## Historical activation evidence from the original Issue72 source line

The following source-line note describes earlier Local4500 operations. This GitHub
source integration does not repeat them or change any Local listener.

## Issue72 Local acceptance follow-up

A reviewed issue72 candidate existed only in an isolated worktree while Local4500 still served the main root through scripts/run-local.cjs. A task-authorized public HTTP check confirmed that the running homepage had neither the new menu nor the statistics strip. The process working directory/entry point and exact source differences were verified; the issue was a missing Local promotion/restart step, not an absent implementation or a Production fault.

An isolated commit and passing tests do not activate localhost:4500. Promote only reviewed source/test/assets paths after checking the main root for conflicting dirty changes, preserve backups and the existing index, regenerate dist with the normal build, test the main root, then restart only the verified Local listener through npm run dev:local. Verify the rendered homepage/menu and public API after restart. Do not substitute a fixture-only preview for actual Local acceptance.

The Local statistics refresh helper enforces private regular config, loopback PostgreSQL identity and a fixed private Local snapshot directory. Configuration is used internally; credentials and operational registration rows are not printed/copied. Tests cover rejecting remote/protocol/default-database targets, permissive files and symlinks. Public snapshots contain only aggregates. See tests/local-statistics-refresh.test.ts and scripts/refresh-registration-statistics-local.cjs.

After the issue72 promotion, the maintained main-root suite passed and the verified Local listener was restarted through the canonical launcher. Fresh public HTTP checks confirmed the menu/summary, report page, aggregate API, pinned CSV and assets. Browser visual acceptance remains separate.

## Production acceptance and source registration, 13 November 2026

The [Issue72 closure record](https://github.com/krit19752518/pmyc-football/issues/72#issuecomment-6845290798)
reports owner Production acceptance of source `9f09966`, including per-age cancellation
exclusion and the statistics menu. This is separate from the earlier synthetic UAT4573
acceptance at22ddb3f. Source registration now uses the permanent GitHub main baseline,
retaining the three governance changes in this knowledge corpus. No deployment, service
switch, snapshot refresh or scheduler activation is part of the registration.
See [integration evidence](../docs/ISSUE72_SOURCE_INTEGRATION_20261113.md).
