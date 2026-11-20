# [FOOTBALL] Apply roster-submission review gates across Admin and SAT

- Incident ID: FOOTBALL-INC-2026-11-11-05
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-11
- Category: athlete document review authorization
- Source files: `src/routes/admin/adminPortal.router.ts`, `src/routes/admin/adminPlayerVerification.router.ts`, `src/views/playerVerification.ts`, `tests/admin-auth.test.ts`, `tests/player-verification-api.test.ts`
- Retrieval terms: admin players status badge team submitted_categories SAT roster read-only player verification review save-remark category gating

## Context / symptom

During Issue #66 local acceptance, the user reported that athlete statuses on `/admin/players.php` had not changed. The earlier implementation updated the team roster popup but did not apply the same submission state to the main athlete table or its shared verification popup.

## Confirmed observations

- The `/admin/players.php` table rendered its badge directly from `player.docStatus`.
- Its detail opener called `initializePlayerVerification(player)` without a read-only context, leaving the shared save controls enabled.
- The legacy `save-remark` route checked submitted categories only for SAT officers; central Admin could still reach the review endpoints before roster submission.

## Unknowns and hypotheses

- No Production behavior or athlete record was inspected for this report.
- The user's screenshot showed the Local `/admin/players.php` page, but did not include a detail popup or a save attempt.

## Confirmed cause

The Issue #66 implementation had scoped the new submission gate too narrowly to the SAT team detail route and SAT role checks. The main Admin athlete page remained on the old `docStatus`-only rendering and editable popup defaults.

## Impact and artifact state

This was a Local source/runtime consistency gap. No database row, user document, or Production service was modified.

## Resolution / invariants

- The main athlete table checks every registered category against the team's submitted categories. If any category is missing, it shows `ยังไม่ส่งรายชื่อ` instead of presenting the document review status as current.
- The shared player verification popup remains available for viewing and AI results but disables status and review saves until all of that player's categories are submitted.
- Both the verification review endpoint and legacy `save-remark` endpoint enforce the same rule server-side for central Admin and SAT. The SAT province check remains in force, and the SQL update rechecks submission state to protect against a race after the initial read.
- Demo review remains in its separate Demo path. Deletion behavior is unchanged.

## Regression checks

Tests cover Admin and SAT submission gating, the `/admin/players.php` read-only context, per-category submission completeness, direct API rejection, SAT province scope, and runtime/source parity. `npm run build` passed; the full suite passed 976 tests before the final test-only assertion was added. The added central/ SAT legacy API regression was then run with its focused test.

## Follow-up / limitations

Authenticated visual acceptance in the Local browser is still needed. The Local launcher could not take port 4500 because an existing Node listener held it; that listener was not stopped. Production deployment is not included.
