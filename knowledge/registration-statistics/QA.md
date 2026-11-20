# Issue72 Local verification — 12 November 2026

> Source-registration status, 13 November 2026: this document contains dated earlier
> verification phases. The accepted source is9f09966 and Issue72 is closed following
> owner-reported Production acceptance. Current public snapshots exclude cancelled ages
> (v2); the statistics menu is visible, homepage summary/actions stay hidden, cron stays
> disabled and Sheet remains deferred. No deployment or refresh is performed by this
> GitHub registration. See [current integration record](../../docs/ISSUE72_SOURCE_INTEGRATION_20261113.md).

Candidate: Local branch codex/issue72-public-statistics in /tmp/football-issue72-work.
Base:56a034b6424972a7967981e025e6e7f0ee154b93 (accepted issue70 source candidate).
No Production action or remote operation was performed. Initial isolated verification used
synthetic fixtures; the later Local4500 activation reads only the configured Local source
to publish aggregate snapshots, without changing registration records.

## Executed checks

- npm run build:passed.
- Full Jest suite:64/64 suites,1015/1015 tests passed.
- Knowledge retrieval regression:41/41 passed.
- Client/home/preview JavaScript syntax checks:passed.
- Existing runtime parity/source preservation:passed using reversible exact issue72 edits;
  no unrelated runtime golden hashes were replaced.
- Isolated PostgreSQL18 cluster:real summary SQL, repeatable-read consistency across a
  concurrent registration, daily idempotence and separate-worker advisory locking passed.
- Private snapshot storage:restart persistence, retained export version, tamper/PII rejection,
  missing-first-snapshot and failed-final-rename preserving last-good passed.
- Fixture:U14 628/U16 683/U18 525;1836 entitlements,77 provinces,928 unique districts,
  463 registered/465 zero;Bangkok zone vectors and KhonKaen/Thonburi cases passed.
- Anonymous HTTP integration:pinned CSV, all928 area rows, metadata, invalid/missing versions,
  no Set-Cookie and aggregate allowlist passed.
- Shipped client executed with in-memory DOM adapter:age-specific zero/district all-age
  summary, ten-row screen/all928-row print mode, stale/unknown/unavailable/retry passed.
- Preview entrypoint:temporary loopback HTTP smoke passed with approved aggregate fixture;
  child server was stopped afterwards. This is not browser/visual evidence.
- Changed document relative links and scoped git diff whitespace checks:passed.

The first full test run had one client-test fixture reuse error:formatted Thai display time
was reused as an ISO input. Corrected the test to pass the original ISO timestamp.
The final full suite passed. A further focused client run covers dynamic registry labels.

## Pending acceptance

The browser access host returned unavailable; no browser screenshots,390px viewport,
keyboard/screen reader or actual Thai PDF printing have been verified.
Only the approved reference screenshot/source was inspected.

Production installation of the nightly23:00 Asia/Bangkok job, shared durable directory,
first real refresh and simultaneous reference-report reconciliation are release acceptance
tasks, not executed here. No quota/FIFO/status changes or schema migration were made.
Google Sheet integration is explicitly deferred by the Owner. Issue72 remains open for
these acceptance steps; this document does not authorize deployment.

## Local4500 activation follow-up

The Owner reported no new menu at localhost:4500. HTTP confirmed that the active main-root
launcher still served the previous runtime; the isolated worktree had not activated it.
After exact-file comparison and a code-only backup, the reviewed source/tests/assets were
promoted into the main root. Existing staged/unrelated work and operational files were
preserved; generated dist was rebuilt normally. The main-root test run passed65/65 suites
and1018/1018 tests. Knowledge retrieval after adding the activation regression passed42/42.

The Local refresh helper successfully published an aggregate snapshot using the existing
private Local config internally after loopback/database/nonreplica checks. No registration
rows or schema were modified and no fixture was substituted for the Local report.
Only the verified Local4500 listener was stopped, then npm run dev:local started the normal
main-root runtime. Fresh HTTP checks passed for homepage menu order/summary, report page,
anonymous complete-registry API, pinned CSV and JavaScript/CSS/font assets.
The Local server remains running for Owner testing. Browser visual acceptance is still
pending; these HTTP checks are not a visual verification.

## Owner-requested hidden homepage entry

The Owner subsequently requested hiding the statistics menu on the Local homepage while
testing the direct report URL. Shared navigation and the homepage statistics strip/actions
were removed; the direct report and aggregate API remain enabled. After the Local build
and verified launcher restart, fresh HTTP checks confirmed no homepage statistics link/strip,
with /registration-statistics.php and its API still returning200.

## Owner change13Nov2026 — public cancellation exclusion, Local acceptance

- Public counter now excludes cancelled registered ages, with independent SQL comparison.
  Shared Admin cumulative counting default and Admin report source remain unchanged.
- Version2 metadata/labels agree across current API/cards/table/modal/print/CSV. Legacy
  pinned versions retain cumulative counts and labels; old current cannot masquerade asv2.
  Same-day upgrade and explicit operator --force refresh retain advisory lock/READ ONLY
  transaction/last-good guards. No public refresh endpoint or scheduler was added.
- Initial focused PostgreSQL run found an extra FILTER closing bracket. Only synthetic
  isolated test transactions ran; the fixture cluster stopped in afterAll. Corrected SQL
  then passed all27 focused tests across4 suites, including real PostgreSQL cancellation,
  restoration, source consistency and competing-writer checks.
- Final npm run build and JavaScript syntax checks passed. Full npm test:65/65 suites,
  1023/1023 tests passed. Incident retrieval regression:43/43 passed. These are the current
  maintained main-root suites, distinct from the earlier release worktree suite count.
- Code-only before-change backup retained outside the repository. Original Git index and
  Admin source hash remained unchanged; no unrelated work staged/committed or overwritten.
- Verified the exact main-root node scripts/run-local.cjs listener, stopped only that
  Local4500 PID, published a validated Localv2 snapshot through the guarded loopback helper,
  then restarted via npm run dev:local. Runtime preflight confirms all edited source mtimes
  precede the new listener; no temporary server entry was substituted.
- Fresh Local HTTP checks pass: direct report, new-definition aggregate API, complete
  77/928 registry and15/16/19 zones, pinned CSV with928 unique district codes and correct
  exclusion label, served JavaScript hash matching source, and hidden homepage entry.
  Local operational counts/configuration/rows are not copied into this knowledge document.
- Browser visual/mobile/actual Thai PDF acceptance remains unverified. Owner Local UAT is
  pending at http://localhost:4500/registration-statistics.php#stats. HTTP is not visual QA.
- This follow-up changed no Production runtime/data/schema or cron. The Owner-cancelled
  Production scheduler stays disabled; Production deployment needs its own release scope.
  Google Sheet stays deferred. Production refresh must bootstrapv2 rather than reusev1.

To refresh Local after another registration/cancellation change without installing cron:

    node scripts/refresh-registration-statistics-local.cjs --force

Refreshing the browser alone only reads the retained snapshot.

## Historical adapter preparation retained from prior release

The following section records the prior adapter preparation. Owner subsequently cancelled
cron; it stays disabled. It does not authorize installation or describe the current release.

## Production runner preparation

Added a scoped production adapter and one frozen cron entry. Tests validate trusted managed
configuration, destination identity, symlink/ownership/write-permission rejection, installed
private directory root resolution, and fail-closed behavior before importing the job.
All source/data in these tests is synthetic. Production metadata/schema/count checks are
kept in the task release evidence, not copied into fixtures or incident knowledge.

A read-only Production dependency probe exceeded its original15second deadline. Resource
metadata and one public HTTP check were collected without mutations; the old probe was no
longer present and the existing homepage returned200. One authorized bounded follow-up
completed in26.53seconds with both pure helper contracts passing. The original cause remains
unconfirmed; do not label increasing a deadline as a fix or relabel the first check as passed.
No deployment activation/restart occurred during this recovery. Cron/bootstrap now have an
explicit maximum runtime; Production startup readiness still needs Gate B verification.
