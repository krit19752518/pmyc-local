# Issue72 — accepted source registration on GitHub

This branch registers the completed feature's source on the GitHub main baseline.
It performs no deployment, service restart, database/schema change, snapshot publication,
cron installation or Sheet operation. Issue72 remains closed.

## Source identity and acceptance

- Target repository: `krit19752518/pmyc-football`.
- Integration branch: `work/issue72-accepted-on-main`, based on main
  `799769d789391e276d868ccb3f2701e11477105e` after PR74.
- Original accepted feature source: `9f09966c96515dc2783241ac64b9caafc83f06fe`.
- Original source range: `56a034b6424972a7967981e025e6e7f0ee154b93..9f09966c96515dc2783241ac64b9caafc83f06fe`,52 paths.
- Acceptance: [owner-reported Production PASS and Issue72 closure](https://github.com/krit19752518/pmyc-football/issues/72#issuecomment-6845290798).
  Its menu runtime SHA-256 is recorded there as
  `42682cfe046e774e31ecc16c5f739b2b115f0c5b4a2396ced4d7bc59c251bfa8`.
  The new integration's comparison uses committed source and that recorded evidence;
  no current Production checksum or browser/DB check is claimed.

The older synthetic UAT4573 source22ddb3f is retained with its original acceptance scope.
Its private runtime/configuration is not copied or switched. The latest accepted source
includes the cumulative feature, later per-age cancellation policy and final menu change.

## Current application contract

- Public reports count distinct registered team/age entitlements, excluding cancelled ages
  under `registered-entitlements-excluding-cancelled/v2`; pending/all genders and unknown
  geography remain in scope. Demo/deleted/unregistered entries remain excluded.
- The shared Admin report retains its cumulative default. No quota, FIFO, team/player
  workflow or registration status is changed by this public read model.
- The registry contains77provinces/928districts and the approved Bangkok15/16/19 partition.
  These are versioned registry properties, not frozen live registration totals.
- Anonymous report/API/pinned CSV and print use versioned aggregate snapshots. Failed
  refresh retains last-good; old cumulative versions are explicitly pinned historical data.
- Shared navigation exposes the statistics report after rules and before registration.
  Homepage summary/actions stay hidden. No automatic snapshot refresh is triggered by GET.
- Cron is disabled; Sheet remains deferred. The retained cron source is now commented out
  as a deliberate safety/documentation difference from the historical source, not an
  installation action. The production adapter is tested with synthetic settings only.

## Integration and preservation

Only committed code/tests/assets/knowledge from the approved range are imported.
The original worktree's two SQL deletions are preserved privately and are not applied.
The three overlapping knowledge files are merged with main's governance updates rather
than copied wholesale. A new retrieval regression records the accepted source boundary.
Generated `dist/` is rebuilt from TypeScript, with exact comparison against the committed
accepted artifacts and a complete generated-path delta check before publication.

Main, the accepted UAT worktree, the original dirty standalone repository and all existing
recovery files remain preserved. New code-only recovery patch/manifests stay private.
No operational configuration, credentials, sessions, uploads or real data snapshots enter
the GitHub branch. Package manifests and lockfile remain unchanged.

## Verification record

Fresh integration build/focused/full/knowledge tests and source/artifact comparisons are
recorded in [the integration manifest](../knowledge/issue72-source-integration-20261113.json).
Earlier acceptance/test statements in imported knowledge remain dated historical evidence.
The synthetic PostgreSQL tests create their own isolated clusters, not application DBs.
No fresh full-application visual/mobile/PDF or Production test is claimed by this import.

## Fresh source-integration checks

Build passed. Focused verification passed5suites/32tests; the full suite passed66suites/
1028tests, including isolated synthetic PostgreSQL execution. Knowledge retrieval passed
46tests. All63generated JavaScript modules exactly match committed source9f09966; the
complete generated delta contains only the11expected dist paths. The menu layout hash
matches the value recorded in the owner's release/closure evidence. Application trees
at the old feature base and the new GitHub main base were identical before applying the
feature, so no source/runtime baseline drift was silently carried into the import.

New relative links and JSON validation passed, with no whitespace warnings. Dependency
and governance files are retained; the cron source contains zero active entries. The
reviewed URL scanner matches are synthetic test data, not copied credentials. Full tests
ran with an unusable loopback default database URL and no inherited paid-OCR/Phase2
configuration; integration SQL tests used their own temporary PostgreSQL clusters.
These checks establish source/build preservation, not a fresh live deployment or UAT.

## Publication boundary

Prepare the exact diff and local PR title/body first. Owner approval is required before
push/open PR, with merge approval separate. The PR relates to the already completed Issue72;
it neither reopens it nor requests another deployment. After an approved merge, update
permanent Local main by a separately scoped fast-forward, without switching Local4500/UAT.
