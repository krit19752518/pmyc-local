# Public registration statistics — issue72

> Source-registration status, 13 November 2026: this document contains dated earlier
> verification phases. The accepted source is9f09966 and Issue72 is closed following
> owner-reported Production acceptance. Current public snapshots exclude cancelled ages
> (v2); the statistics menu is visible, homepage summary/actions stay hidden, cron stays
> disabled and Sheet remains deferred. No deployment or refresh is performed by this
> GitHub registration. See [current integration record](../../docs/ISSUE72_SOURCE_INTEGRATION_20261113.md).

Local implementation based on the Owner-approved UX/UI source:
[PR1](https://github.com/Jerdyy/PMYCfootball_Phrase1/pull/1),
commit 6105a8ed926e18ccc9d1501236809947bdd3b210.
The report retains the approved cards, coverage tiles, filters, zero-row styling,
province/district views, district modal, pagination, CSV and all-filtered-row printing.
The report navigation places its statistics link after rules and before registration.
Homepage statistics links/summary/actions remain hidden under the Owner's later instruction.
The prototype review bar and simulated home are removed. Loading/unavailable, stale and
unassigned-area states are added as required by the handoff.
The existing Noto Sans Thai variable font is reused locally without modification
(SHA256:5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8).
Its SIL Open Font License accompanies the report assets.

## Runtime contract

- Page: /registration-statistics.php.
- Anonymous aggregate API: /api/public/registration-statistics.
- Pinned CSV: /api/public/registration-statistics.csv?snapshotId=<64-hex-id>&level=district.
- Optional filters: province (master Thai name), zone (approved Bangkok name),
  level=province|district, age=all|U14|U16|U18, status=all|zero|registered,
  q, sort=gap|total|name. Pagination affects only the screen, never CSV/print.
- UI holds one snapshot for its lifetime; exports explicitly request that ID. Old
  versions are retained. No public refresh/write route and no database calls on GET.
- Metadata includes asOf (DB read transaction time), generatedAt, snapshotId, jobKey,
  timezone, definitionVersion, registryVersion, seasonScope and includesCancelled.
- ages is [U14,U16,U18]. National unassigned means unknown province;
  each province's unassigned means unknown district. Both are already in national totals.
  Province totals include its unknown districts. Zone totals use known districts only.
  Unknowns are separate from the official registry, coverage and district table/footer.
  CSV has explicitly labeled summary rows with blank area codes; they are not extra areas.
- No team IDs, team/contact/player records, credentials, document URLs or admin sessions
  are serialized. Invalid/tampered snapshots fail closed.

## Counting and source

Owner updated the public counting contract on13Nov2026: exclude cancelled registrations
**per registered age**, while continuing to include pending/all genders and unknown geography.
The public snapshot uses definitionVersion=registered-entitlements-excluding-cancelled/v2
and includesCancelled=false. A school registered inU14/U16 that cancels onlyU14 contributes
oneU16 entitlement. Cancellation markers for unregistered ages never subtract another age.
Deleted/Demo rows, unregistered tokens and duplicate ID/age enrollments remain excluded.
No athlete join, approval/date filter, quota8, FIFO or registration-state mutation.

The pure counter remains shared with /admin/report-teams-categories.php, whose existing
cumulative enrollment default is deliberately unchanged. Public aggregation explicitly opts
out of cancelled ages; the independent reference SQL applies the same public policy.
This public/Admin difference is intentional under the Owner's current scope.

The source table has no season/event selector in this schema. seasonScope explicitly
records the existing report's current-table scope; no invented date filter is applied.
Do not reuse this scope for a future multi-season schema without a versioned change.
Each refresh reads under a PostgreSQL REPEATABLE READ READ ONLY transaction and checks
the pure result against independent distinct-age SQL aggregates in that transaction.
Use simultaneous source/snapshot reconciliation at release; the old fixture is not a live
target. No source correction or schema migration is part of this change.

Versioned master:77 provinces/928 districts from the supplied MIT registry.
Legacy names normalize via the existing province alias/Bangkok district and same-province
contact fallback, then resolve to master codes. Unknown geography is never guessed/dropped.
Bangkok's authoritative district mapping partitions50 districts into15/16/19, ignoring
legacy zone labels. See [source attribution](reference-SOURCES.md) and [license](reference-LICENSE.txt).

## Durable refresh and scheduling preparation

Build first, then the separately scheduled entry point is:

    node dist/jobs/refreshRegistrationStatistics.js

It is not invoked by server startup or public requests. The job takes a PostgreSQL session
advisory lock across reading, validation and publication, skips an already-published daily
slot for the same definition unless the operator explicitly requests --force, and releases/discards its connection correctly. Daily slots roll at23:00 Asia/Bangkok
independent of host timezone. A delayed run publishes actual read time, not the nominal time.
Repeat the job after a failed attempt; it is safe to retry after inspecting the failure.

Owner cancelled the installed Production cron on13Nov2026. Keep scheduling disabled.
Manual refresh is an operator action, never a public GET. The job/local helper accept
--force to refresh within the same day after a registration/cancellation change; locks,
READ ONLY transactions, validation and last-good protection still apply. No automatic
freshness is promised: asOf and the existing stale/failure indicator describe the snapshot.
The original23:00 due-key calculation remains for compatibility, not scheduler installation.
Production execution still requires explicit deployment/operational authorization.

REGISTRATION_STATISTICS_DIR optionally sets an absolute private durable directory shared
by job and web workers. Default is .runtime/registration-statistics beside application
source/build roots. It must survive release directory replacement. Never place it under
public/uploads or a symlink. Provision permissions for the runtime account. Files are0600;
new directories0700. Publishing validates all codes, partitions, counts, digest and time,
fsyncs an immutable version, then atomically renames/fsyncs current.json.
The prior current file survives failed reading/validation/publication; no memory fallback
or partial/zero placeholder is published. An empty source requires operator review.
Failures mark stale when storage allows; a missed23:00 deadline independently marks stale.
Before any good snapshot the API returns503 and UI says unavailable.

Retain immutable versions while an old page/export can still be used. This implementation
does not prune versions; plan storage/backup retention before introducing cleanup.
Single-host/shared-filesystem publication is assumed. Multiple hosts must share the same
durable directory or use a coordinated artifact distribution before serving this feature.

## Local verification and review

    npm run build
    npm test -- --runInBand --silent tests/registration-statistics.test.ts tests/registration-statistics-client.test.ts
    node --check public/assets/registration-statistics/app.js
    node --check public/assets/registration-statistics/home.js
    node scripts/preview-registration-statistics.cjs

For the maintained Local4500 application, promote only the reviewed issue72 paths into the
main root, preserve unrelated dirty work, build/test there, then restart its verified launcher
with npm run dev:local. An isolated worktree alone does not change localhost:4500.
To generate a real Local snapshot without copying credentials or Production data, run:

    node scripts/refresh-registration-statistics-local.cjs --force

This helper uses the existing private Local launcher config internally, enforces a loopback
PostgreSQL host/database/nonreplica identity, and writes only private Local aggregate snapshots.
It does not launch the web server, install a scheduler, or mutate registration rows.

The preview serves only the approved aggregate fixture at http://127.0.0.1:4572/;
it creates synthetic entitlement IDs in memory, uses a private temporary snapshot, and never
connects to the registration DB. Stop with Ctrl+C. Fixture data is12Nov2026 11:06 Bangkok,
not current registration counts. The stale indicator is expected after that fixture's deadline.

Test coverage includes the full approved1836-team/928-area fixture, age-specific zero,
unknown areas, duplicate IDs, private payload rejection, durable/pinned export, failure
preservation, transaction/lock/idempotency, and actual shipped client logic using an
in-memory DOM adapter. That adapter is not browser or visual QA.

## Remaining release acceptance

Executed checks and remaining evidence are recorded in [Local QA](QA.md).

- Browser host was unavailable during implementation. Desktop/mobile390px visual comparison,
  real keyboard/screen reader checks and actual Thai print-to-PDF must be completed.
- Keep cron disabled as requested. Verify the new-definition snapshot and SQL reconciliation
  under separate Production release authorization; this Local change is not a deployment.
- Google Sheet integration is deferred explicitly by the Owner; no competing writer added.
  Future integration must consume the same immutable snapshot/version.
- No Production deployment, DB/schema change or Production restart is included here.

## Owner testing visibility

The Owner requested hiding the statistics menu and homepage report entry points during Local acceptance. Shared public navigation and homepage summary/actions are removed for now. The direct /registration-statistics.php route, aggregate API and pinned CSV remain available for testing. Re-enable homepage discovery only when requested.

## Snapshot definition transition

The current unpinned API accepts only the new public v2 definition. An old cumulative
current.json returns503 until a validated v2 bootstrap is published; it is never relabeled
as excluding cancellations. A same-day v1 snapshot cannot suppress the first v2 refresh.
Historical v1 immutable versions remain readable by explicit snapshotId; CSV derives its
counting label from that version's metadata. Onlyv2 can be newly published. A failed
refresh retains last-good bytes; historical bytes never become a v2 fallback.
No snapshots are pruned. Refreshing the browser reads a snapshot; it does not run the job.

## Historical adapter preparation retained from prior release

The following section records the prior adapter preparation. Owner subsequently cancelled
cron; it stays disabled. It does not authorize installation or describe the current release.

## Production scheduled-job adapter

Source:scripts/registration-statistics/production-runner.cjs, installed as the exact same
bytes at .runtime/registration-statistics/run.cjs. It reads only the managed DATABASE_URL
from the existing Passenger .env file, validates its owner/write permissions and expected
DB host/port/database, forces the private snapshot directory and imports only the job.
The existing Node22 wrapper supplies production mode and module paths without being edited.
No credentials are copied to source, CLI arguments, logs or the cron entry. The runner has
configuration and installed-layout synthetic tests. The cron source is a separately frozen
production-crontab.entry:one23:00 job on the verified+0700 server, with output redirected
to a private0600 log. Outbound email/LINE notifications are not configured by this adapter;
failed exit/structured log and the public stale indicator are the initial monitoring surfaces.
Gate A stages/backs up only; first Production summary, cron installation and restart require
Gate B. No Local config/helper or fixture data is transferred to Production.

The frozen cron command bounds each run to120seconds with TERM and a10second kill grace,
so a stalled CLI cannot accumulate indefinitely. The existing job's READ ONLY transaction
and atomic publication preserve the last-good artifact. A timed-out command records its
signal in the private log; no email/LINE message is sent. The deployment bootstrap must also
use the approved bound before switching existing entrypoints.
