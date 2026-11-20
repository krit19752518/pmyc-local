# [FOOTBALL] Require complete officer decisions and derive player status

- Incident ID: FOOTBALL-INC-2026-11-09-03
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Category: player manual review validation
- Source files: `src/views/playerVerification.ts`, `src/services/playerVerification.service.ts`, `src/routes/admin/adminPlayerVerification.router.ts`, `tests/player-verification-ui.test.ts`, `tests/player-verification-api.test.ts`
- Retrieval terms: player review completeness mandatory radio identity same different person decisions SYSTEM_CORRECT APPROVED ACTION_REQUIRED team note pending reset marker cache generation cancelled late completion

## Context / symptom

The requested Local review workflow requires a decision for every field and an explicit same-person or different-person decision before saving. The old UI hid decisions for some successful AI comparisons and used an optional identity checkbox; the route trusted the submitted status and accepted partial reviews.

## Confirmed observations

Source inspection confirmed hidden decision controls and partial-review acceptance; synthetic regression tests verify the replacement behavior.

## Unknowns and hypotheses

Authenticated visual acceptance has not been checked in this task. No claim is made about a particular athlete or live record.

## Confirmed cause

`renderRows` replaced decisions with a dash for MATCH, NO_REFERENCE and NOT_APPLICABLE rows. `validateReview` accepted missing fields. Approval restrictions only applied to successful AI jobs and did not derive status for manual reviews.

## Impact and artifact state

This Local change updates source, generated output and synthetic regression fixtures. It does not migrate the schema or directly edit application records.

## Resolution / invariants

All four displayed review fields always offer three mutually exclusive decisions, regardless of the AI result. Both UI and API require all four decisions and an explicit boolean identity decision. APPROVED requires all SYSTEM_CORRECT decisions and same-person confirmation; any CORRECT_DATA, REUPLOAD or different-person choice yields ACTION_REQUIRED. The server derives the saved, audited, cached and returned status independently of the submitted status. The disabled status display previews this rule.

Team notes retain custom text and include required field reasons and the different-person reason. Missing required reasons are appended by the server; total note length remains bounded to 4000 characters. Internal notes remain separate. No authoritative personal data is corrected by a review.

New reviews store `faceReviewed: true` in the existing review JSON. Legacy unchecked checkboxes (`faceConfirmed: false` without that marker) reopen without an identity selection, because an unchecked checkbox did not establish a different-person finding. No schema migration is needed.

## Regression checks

Synthetic API and client-script tests cover incomplete decisions, missing identity, both negative field choices, different-person selection with otherwise correct fields, derived status despite a conflicting submitted status, required reasons, legacy checkbox loading, and radio choices on every AI row. The four focused suites pass 76/76. TypeScript build passes. The full suite reports 388 passed / 31 failed; failing test names exactly match both preceding Local JSON reports (360/31 and 373/31), with no newly failing names. The full suite remains failing. Incident retrieval regression checks pass 14/14.

The initial focused run stopped at Supertest `listen EPERM` under the sandbox, before API assertions; no real application records were written. The authorized rerun passed. A read-only attempt to locate older test reports under `/tmp` encountered permission denials in unrelated private service directories; that enumeration was stopped without modifying those directories.

The first knowledge regression run failed with `incident sections are incomplete: incident-2026-11-09-review-completeness.md` because this new entry omitted mandatory sections. The read-only retriever made no changes. The entry was corrected to match the parser's required headings before rerunning the checks.

## Follow-up / limitations

Authenticated browser acceptance remains a separate user check. Production deployment and operational record changes are outside this Local implementation.

### Subsequent OCR-only feature scope

The approved `feature/issue55-iapp-ocr-20261109` implementation removes face
comparison and the face-decision radio requirement. Four field decisions still
derive status and mandatory team reasons. This historical incident describes the
previous face-enabled version; do not reintroduce that retired requirement into
the OCR-only branch. The older dirty application checkout and Production have
not been switched by this implementation. See
[OCR field boundaries](incident-2026-11-09-ocr-field-boundaries.md).

### Subsequent explicit manual-status request

The user subsequently requested an editable document-status selector for Admin
and provincial SAT reviewers. In the current OCR-only Local branch, explicit
PENDING/APPROVED/ACTION_REQUIRED/CORRECTED selection supersedes the older disabled,
derived-only status policy above. All four field decisions, mandatory team-note
reasons, transactional audit and province/role/CSRF boundaries remain required.
The server validates and persists the explicit status; requests omitting it still
derive a suggestion. Review/audit metadata retain statusSource and decisionStatus.
Manual selection is not overwritten by radio changes, late OCR results or save.
Synthetic UI/API and browser cases cover all four choices, invalid values,
cross-province denial, preservation across async completion and the persisted
SQL parameter. No live athlete status is changed by these verification tests.

### Subsequent pending reset request

Saving PENDING now clears the selected player's prior AI results and decisions,
so that reset is the explicit exception to the four-decision prerequisite.
Other statuses retain complete decisions. A transaction cancels old jobs and
inserts a reset marker while keeping notes, audit and paid-usage reservations.
Do not delete shared OCR cache entries to reset one player: bind future source
and cache keys to that player's new reset generation instead. Late completion
updates only RUNNING jobs and cannot restore a cleared one. Enqueue rechecks the
generation under the player advisory lock to reject snapshots predating reset.
Reopening returns empty and waits for explicit paid-recheck confirmation.
Synthetic browser/API cases and a disposable PostgreSQL fixture verify empty
reopen, rollback, player isolation, late completion and retained usage.
