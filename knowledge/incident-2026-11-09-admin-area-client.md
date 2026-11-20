# [FOOTBALL] Admin district helper omitted from rendered pages

- Incident ID: FOOTBALL-INC-2026-11-09-06
- Status: verified
- Resolution: resolved
- Last verified: 2026-11-09
- Source files: `src/adminLayout.ts`, `src/layout.ts`, `src/utils/teamArea.ts`, `tests/admin-area-client.test.ts` in the reconciled Local runtime candidate
- Retrieval terms: PmycTeamArea undefined getTeamDistrictName renderTeamAreaClientScript teams-demo district filter

## Context / symptom

The Demo team table and district filter raised a browser TypeError when accessing `window.PmycTeamArea.getTeamDistrictName`.

## Confirmed observations

The active Local candidate's portal used the shared area helper, but its admin layout did not emit `renderTeamAreaClientScript()`. Required helper functionality passed isolated tests without proving initialization in a complete page. An authenticated HTML response alone did not establish browser execution.

## Unknowns and hypotheses

The provenance of the missing layout integration is unverified. No Production behavior was inspected or changed for this correction.

## Confirmed cause

The browser helper was never initialized before page consumers executed.

## Impact and artifact state

The correction was applied to authoritative TypeScript in the active reconciled Local candidate at `/tmp/football-issue55-source-reconcile-20261109/candidate/football`, then generated with `npm run build`. The original dirty application checkout was not replaced. This is a Local correction, not a Production release.

## Resolution / invariants

Emit the shared area script in the admin layout before page content and its scripts. Declare the existing logo as the favicon. Preserve the distinction between administrative districts and competition zones. Do not infer a data error from a broken client table.

## Regression checks

`tests/admin-area-client.test.ts` executes the emitted helper and consumer in order for four admin navigation contexts. Build and all 572 tests passed. Headless Chrome against the restarted Local runtime returned no page errors; selecting each of four districts displayed nine expected teams, and the declared favicon returned HTTP 200. Attachment requests were blocked during this browser check.

## Follow-up / limitations

Future release preparation must include this Local delta explicitly; prior candidate checksums do not describe the corrected artifacts. The original checkout still lacks the candidate's recovered area modules. Do not copy generated files into it independently of their source dependencies.

The test command initially hit a sandbox restriction. After explicit hook recovery, approved tests passed. Reading old diagnostic lines back through a broad failure-matching hook can create another lock; use sanitized summaries for historical logs, retain original evidence, and follow the hook's exact user resume protocol. Do not remove or disable locks to continue.
