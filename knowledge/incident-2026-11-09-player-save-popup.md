# [FOOTBALL] Player review save uses a browser alert

- Incident ID: FOOTBALL-INC-2026-11-09-01
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Category: admin player review UI
- Source files: `src/views/playerVerification.ts`, `tests/player-verification-ui.test.ts`
- Retrieval terms: admin players modal save status browser alert popup SweetAlert2 verification review

## Context / symptom

Saving a status in the player details modal on `/admin/players.php` displayed a native browser alert instead of the site's popup.

## Confirmed observations

The verification modal binds its own click listener to `btnSaveAdminRemark`. That listener used `alert()` for both success and failure. The shared layout already loads SweetAlert2.

## Unknowns and hypotheses

Visual acceptance in an authenticated Admin/SAT session remains a user check.

## Confirmed cause

The active listener in `src/views/playerVerification.ts` used browser dialogs. Editing only the legacy `saveAdminPlayerRemark` function in the route would not fix this modal's save button.

## Impact and artifact state

The notification presentation was inconsistent. This change affects local client rendering; it makes no database or production changes.

## Resolution / invariants

Use `Swal.fire` for save success and failure. Update the table and close details only on successful save. Keep errors inside the open detail modal so Bootstrap focus management allows the user to acknowledge them and retry. Ignore stale and aborted errors. Guard against duplicate pending saves.

## Regression checks

`tests/player-verification-ui.test.ts` executes the generated client script with synthetic DOM/API fixtures: success updates the status and opens a success popup; server/network errors preserve editable details and show errors; repeated clicks send one pending request. No real player data is used.

## Follow-up / limitations

The fixture verifies client behavior, not rendered appearance or authenticated acceptance. Confirm the popup in the user's local browser before release.
