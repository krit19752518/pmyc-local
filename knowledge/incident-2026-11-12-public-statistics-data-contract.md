# [FOOTBALL] Public cumulative statistics need a separate counting and geography contract

> Current integration contract, 13 November 2026: the public report uses v2 and excludes
> cancelled registered ages. Issue77 changes Admin report 3 to exclude cancelled ages too;
> the shared counter default remains cumulative for other callers. Scheduling is disabled,
> Sheet is deferred, the shared statistics menu is visible, and homepage summary/actions
> remain hidden. Earlier analysis/Local verification below is retained as dated history.

- Incident ID: FOOTBALL-INC-2026-11-12-02
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-13
- Source files: `src/routes/admin/adminReports.router.ts`, `src/models/team.model.ts`, `src/services/teamRegistrationRank.service.ts`, `src/utils/teamCategoryState.ts`, `src/utils/teamArea.ts`, `public/assets/data/thai-administrative-divisions.js`, `knowledge/test_search_incidents.py`
- Retrieval terms: issue77 admin report-teams-categories active registrations total card cancelled categories restoration SAT province issue72 accepted9f09966 GitHub source registration public registration statistics cumulative cancelled FIFO district codes master zone unassigned snapshot last-good fallback memory

## Context / symptom

Issue71 evaluates the Owner-approved public registration statistics handoff. It requires cumulative age-group entitlements including cancellation, complete area rows including zero counts, and consistent UI/CSV/Sheet snapshots.

## Confirmed observations

The existing geographic master contains77 provinces and928 district pairs, matching the UX reference names exactly. Local master entries and registration area columns use names; the UX reference additionally supplies stable area codes. The executive category report counts registered categories on nondeleted real teams without approval/date/gender filtering. getTeamRegistrationRanks excludes cancelled categories and missing area/date records, so its totals have a different meaning.

A task-authorized READ ONLY aggregate diagnostic confirmed that existing registration-area fallback can resolve missing primary districts and that stored Bangkok zone labels can disagree with the Owner-approved district-to-zone map. No operational rows, raw unmatched values or live counts are retained here. The reference map partitions50 districts into15/16/19, as documented in the handoff.

## Unknowns and hypotheses

Historical causes of incomplete primary fields or zone disagreement are unknown. Existing external Sheet automation was not inspected. Matching the current aggregate does not guarantee future geography is complete. No production-ready statistics endpoint or scheduler is claimed.

## Confirmed cause

Active-slot ordering and cumulative public registration are separate contracts. Reusing the active ordering/eligibility filter drops entries the public report must include. Directly trusting legacy zone labels can group otherwise valid district registrations differently from the approved map. The general team reader also returns private fields and falls back to memory after DB failure, making it unsuitable as a public payload or fail-safe snapshot publisher.

## Impact and artifact state

Initial analysis: application source, registration records, schema, quotas and statuses were unchanged. Production diagnostics used aggregate-only repeatable READ ONLY transactions ending in ROLLBACK. No athlete, attachment or credential contents were accessed. Only knowledge and its retrieval regression were added.

## Resolution / invariants

Implement a strict shared counting service for distinct registered team-ID/age entitlements, including cancelled and pending entries, excluding deleted/Demo and unregistered/inconsistent categories according to the reference report. Do not join rosters in a way that multiplies entitlements. Preserve the report's existing season scope without inventing approval/date/gender filters.

Add a versioned coded area master and approved district-to-zone mapping for the read model. Apply the existing province/district normalization and same-province fallback deliberately; never infer a Bangkok zone from an unknown district. Keep unresolved geography in a separate bucket included in national totals, without creating an extra official district or treating missing data as verified zero.

Publish a validated versioned snapshot atomically at23:00 Asia/Bangkok under a single job lock. UI/CSV/Sheet must use the same snapshot/version; DB/query failures retain last-good rather than publish memory/partial/zero data. Coordinate with the existing Sheet automation owner before adding a writer. Public responses must project only approved aggregates and area metadata, never serialize the general team DTO.

## Regression checks

Knowledge retrieval covers the cumulative/cancelled/FIFO/geography/snapshot distinction. Implementation tests must later cover cancelled-only entries, unregistered categories, duplicate joins, invalid geography, last-good failure, public privacy and identical filtered totals across channels. No application implementation or Production UI test was performed in this analysis.

## Follow-up / limitations

Use [Developer Handoff](https://github.com/Jerdyy/PMYCfootball_Phrase1/blob/6105a8ed926e18ccc9d1501236809947bdd3b210/docs/public-registration-statistics/DEVELOPER_HANDOFF.md) as the approved module contract. The prototype computes totals from its fully matched fixture; integration must also support unassigned geography and loading/error/stale states. Adding read-model codes/snapshot metadata does not itself require rewriting every registration row. Source-data correction, if needed, remains separately scoped and authorized.

## Issue72 Local implementation

The isolated issue72 candidate implements a shared distinct ID/registered-age counter, coded registry, authoritative Bangkok mapping and explicit unknown buckets. A separate job reads PostgreSQL under REPEATABLE READ READ ONLY, independently checks SQL distinct-age totals, holds a session advisory lock through publication, and atomically publishes validated private durable snapshots with retained export versions. Public GET reads only the allowlisted aggregate artifact; no memory fallback or implicit refresh is used.

Regression coverage is in tests/registration-statistics.test.ts, tests/registration-statistics-client.test.ts and tests/registration-statistics-postgres.test.ts. The approved aggregate fixture reconciles all928 codes and1836 entitlements. An isolated synthetic PostgreSQL cluster proves SQL execution, cancellation inclusion, Demo/deleted exclusion, concurrent changes staying outside the read snapshot and competing-writer exclusion. Client tests execute shipped logic with a DOM adapter; they are not visual/browser evidence.

Mitigation is Local only. Production source reconciliation, scheduler installation and deployment have not been performed. Browser access was unavailable, so real mobile/keyboard/print-to-PDF acceptance remains pending. The Owner explicitly deferred Google Sheet integration. No registration data/schema, quota/FIFO, or Production runtime was changed. See knowledge/registration-statistics/README.md for the integration boundary.

## Owner change: exclude cancellations publicly,13Nov2026

The original includes-cancelled behavior matched the earlier approved handoff; it was not
an accidental status filter omission. The Owner subsequently requested exclusion of cancelled
registrations from the public report. Confirmed current storage separates registered categories
from cancelled_categories; cancellation is per age, so excluding an entire school would drop
its remaining registrations. Orphan cancellation markers do not create or subtract enrollment.

The updated public policy explicitly excludes cancelled ages while the Admin counter's default
remains cumulative. Public snapshots use a new definitionVersion and includesCancelled=false;
strict validation recognizes historical v1 only with its original true flag. Current API requires
v2, but explicitly pinned historical exports keep their original counts and label. Same-day
idempotency checks the definition; operator --force permits manual same-day updates after
changes. Cron stays disabled by the Owner's separate request. No registration data/schema,
quota/FIFO/status update is part of this change; Production deployment remains separate.

Regression cases cover partial/full cancellation, restoration, duplicates, orphan markers,
Admin default preservation, area zeros, real synthetic PostgreSQL SQL reconciliation and
concurrency, version/flag mismatch, same-day upgrade/manual refresh, pinned legacy CSV and
last-good failure. An initial synthetic PostgreSQL run caught an extra FILTER closing bracket;
only isolated fixture transactions were affected, corrected before any Local activation.

## Accepted source registration on GitHub main

The owner-reported Production acceptance and completed Issue72 record identify `9f09966`
as the latest source line. The GitHub integration branch starts at `799769d` and preserves
the same application/runtime behavior, with governance knowledge merged separately.
The cron source example is commented out by default to reflect the accepted disabled
schedule. This source-only task neither reruns deployment nor asserts fresh Production
parity, database state or UI acceptance. Retrieval regressions distinguish this accepted
revision from the historical22ddb3f synthetic UAT.
See [source integration](../docs/ISSUE72_SOURCE_INTEGRATION_20261113.md).


## Issue77: Admin team/category report owner change, 13 November 2026

The owner reported that “ส่งแข่งรวม” on `/admin/report-teams-categories.php` included
cancelled registrations and requested their exclusion. Current source confirmed that
report 3 called `registeredEntitlements` with its cumulative default. This followed the
previous contract; the new request changes only this report's enrollment policy.

The isolated Issue77 candidate explicitly passes `includeCancelled: false`. The total,
age cards, age table, distribution chart and multi-age count share that active set.
Cancellation removes only registered matching ages; remaining ages still count, orphan
cancellation markers add/subtract nothing, and restored ages count again. Institution
count and its percentage denominator retain the existing report scope. The explanation
now distinguishes active age entries from institution accounts without claiming the age
total must exceed institution count. SAT province and deleted-team filtering are unchanged.

`tests/admin-category-cancellations.test.ts` covers those rendered totals with mocked
registration rows and synthetic sessions, including empty results and SAT scope. The
shared counter's cumulative default remains covered for other callers. Exact Issue77 inverse edits reconstruct the full reviewed prior source hashes before older runtime baseline checks; missing/duplicate edits and unrelated source drift are rejected. These tests do
not prove authenticated browser acceptance or Production state. No service switch,
registration/schema change, snapshot refresh or scheduler activation is part of this fix.
Issue77 starts from GitHub main `20a947cf10e43b805e65336f35db085bc225d3bd` in a separate
durable worktree. Local4500 still serves the preserved standalone checkout until a
separately approved reviewed promotion; a passing candidate does not activate that port.
