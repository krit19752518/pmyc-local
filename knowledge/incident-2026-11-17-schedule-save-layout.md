# [FOOTBALL] Schedule POST validation/conflict returned the legacy layout

- Incident ID: FOOTBALL-INC-2026-11-17-01
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-17
- Category: Phase2 schedule POST presentation
- Source files: `phase2/src/MatchPages.php`, `tests/schedule-save-workspace.test.ts`, `tests/fixtures/issue96-schedule-postgres.php`, `tests/phase2-event-create.test.ts`
- Retrieval terms: schedule save POST 422 409 validation conflict legacy Application layout MatchDetailView form input reason time venue redirect saved_version transaction rollback

## Context / symptom

After Owner accepted venue creation, submitting a match schedule reportedly returned the older design. No authenticated request trace or operational write was captured; the reported request's exact outcome remains unverified.

## Confirmed observations

Stage1/2 successful POST already redirected into MatchDetailView. InvalidArgumentException and DomainException escaped to the outer Application::page handlers, rendering the legacy layout; back links omitted context and submitted values were lost. Six new synthetic regressions reproduced the missing shell/input/context/success feedback before the correction. This proves the error-rendering defect, not the original request's validation reason or a failed commit.

## Unknowns and hypotheses

The original authenticated request, validation reason and commit result were not captured. Browser cache is not established as a cause. Owner venue acceptance is narrower than schedule-save acceptance.

## Confirmed cause

Workspace POST exceptions fell through to legacy Application::page handlers instead of being rendered by the staff match view.

## Impact and artifact state

One PHP presentation/controller file plus regression fixtures and Football-only knowledge are changed in the isolated candidate. No operational database writes or serving-file changes occur during these tests. Initial retrieval validation rejected this new record because required template sections were missing; the sections were restored without weakening the parser or regression expectations.

## Resolution / invariants

Handle scheduling POST validation/conflict after canonical authorized match context is established. Render the current shell with status422/409 and escaped submitted fields; disable conflict forms until explicit reload rather than silently rebasing stale input. Reject contradictory context before execute using a safe current-shell response and canonical reload URL. Successful commit uses303 with a version-bound feedback marker; GET/refresh reads persisted state. Existing repository transactions, time/province/overlap/lock/version/idempotency, CSRF and role gates remain authoritative. Public and other-stage layout contracts stay separate.

## Regression checks

Focused synthetic tests cover invalid time/venue/reason, canonical context rejection, escaping and version-bound success notices without DB writes. Disposable PostgreSQL cases exercise actual POST→commit→303→GET, retry, changed request payload, stale version, foreign venue, event date range, overlapping venue, unlocked draw, started/cancelled matches, role/CSRF and exact match/history/audit preservation on rejected requests. Fixture-only setup is restored where shared scenarios continue. Test-run evidence and exact Dev activation hashes are recorded in Issue96/PR97; browser acceptance is separate.

## Follow-up / limitations

Owner-reported venue UAT does not accept the new schedule-save scope. Browser host unavailability leaves live authenticated desktop/mobile request outcome unverified. No schema, operational competition data, Production deployment or validation-policy relaxation is required. Never infer a user's particular validation error or persistence result from the rendered design alone.
