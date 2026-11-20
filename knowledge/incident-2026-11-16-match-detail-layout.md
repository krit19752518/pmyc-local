# [FOOTBALL] Schedule detail opened the legacy match layout

- Incident ID: FOOTBALL-INC-2026-11-16-04
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-16
- Category: Phase2 match detail presentation
- Source files: `phase2/src/MatchPages.php`, `phase2/src/MatchDetailView.php`, `phase2/src/ResultPages.php`, `phase2/src/SchedulePages.php`, `tests/match-detail-workspace.test.ts`
- Retrieval terms: phase2 schedule details legacy MatchPages Application layout WorkspaceView v17 contextual match filters back navigation

## Context / symptom

The workspace schedule list used the new staff shell, but its Details button opened the older functional competition/match route.

## Confirmed observations

SchedulePages built a direct match URL without workspace filters. MatchPages rendered that private route with Application::page, the older layout. A browser cache cause was not established. Changing only the schedule list stylesheet cannot change the destination renderer.

## Unknowns and hypotheses

Authenticated Dev browser appearance and responsive acceptance remain unverified. No cache failure is inferred from source inspection.

## Confirmed cause

The private match destination selected Application's legacy layout instead of WorkspaceView; schedule links omitted contextual filters.

## Impact and artifact state

PHP presentation, contextual links, one shared stylesheet and synthetic tests are affected. No TypeScript runtime build, database schema or competition-data mutation is part of this correction.

## Resolution / invariants

Stage1/2 private match detail uses WorkspaceView with the v17.1 heading, team hero and schedule/post-match/history sections. The existing scheduling and result repositories remain authoritative. Forms retain CSRF, request IDs, match versions, time range, reason and existing permission/lock gates. Result and lineup subpages keep the new shell and contextual return path.

Canonical event, season, mode, division, stage, province, district and match context is derived from authorized backend scope. Contradictory supplied context is rejected before mutation. Public published-only routes remain separate. Synthetic prototype data, role switches and localStorage must not replace backend state.

## Regression checks

The issue91 fixture intercepts every SQL statement and rejects non-SELECT operations. Tests exercise the functional route, scoped return URL, tabs, result/lineup subpages, escaping, SAT access, wrong context, missing match, CSRF, unresolved teams, unlocked draw, started match and read-only role. Initial focused run: 47/47 including existing workspace shell/router coverage. Full-suite and Dev activation evidence are recorded separately.

## Follow-up / limitations

Implementation and tests run on Dev VPS. Browser access was unavailable during initial verification; authenticated desktop/mobile acceptance remains pending. No Production release is implied.

## Test-runner constraint

Default ts-jest type-program construction exceeded the Dev wrapper's 384 MB heap before completing tests. Isolated per-file transpilation allowed the focused tests to run under the same memory/pool limits. This is test execution evidence, not a TypeScript type-check. Do not increase shared-host limits or restart services to mask the failure.
