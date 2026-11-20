# [FOOTBALL] OCR reader misses the public uploads fallback

- Incident ID: FOOTBALL-INC-2026-11-10-02
- Status: verified
- Resolution: resolved
- Last verified: 2026-11-10
- Source files: `src/app.ts`, `src/services/playerVerification.service.ts`, `src/routes/admin/adminPlayerVerification.router.ts`, `tests/player-verification.test.ts`, `tests/player-verification-api.test.ts`, `tests/production-parity.test.ts`, `knowledge/test_search_incidents.py`
- Retrieval terms: OCR document-info verification HTTP 503 ENOENT uploads public uploads asset root fallback missing file before enqueue

## Context / symptom

Athlete details can display an attachment link while document-info and verification return HTTP503, leave comparison rows unpopulated and never create an OCR job. A populated database attachment reference does not establish that the OCR reader can resolve its file.

## Confirmed observations

Express serves `/uploads` from the application uploads directory first, then public/uploads. Before the fix below, `readVerificationAsset` defaulted to the application uploads directory only, unless PLAYER_AI_ASSET_ROOT was explicitly configured. The corrected resolver was selectively deployed after explicit approval; see the release evidence below.

An explicitly authorized, exact-file metadata check confirmed that an affected attachment was absent from the default OCR root with ENOENT, but existed as a readable regular nonsymlink file in the public fallback root. No image bytes were read or copied. No other attachment was inspected under that permission.

## Unknowns and hypotheses

The same cause has not been established for every reported athlete. File placement history is unknown. Metadata does not establish image validity or OCR quality. User-reported progress reaching100 percent remains distinct from this sample's failed API requests and absent jobs; no successful OCR is inferred from a progress display.

## Confirmed cause

The OCR resolver omits a storage root already supported by the web server. Opening the default-root filename raises raw ENOENT before enqueue. Both GET document-info and GET verification call that resolver; their generic non-VerificationError handler maps the filesystem exception to503. POST also constructs the document snapshot before inserting a job.

## Impact and artifact state

The user subsequently requested a fix and explicitly approved deployment. Source/generated output and synthetic regressions implement the resolver correction; only the generated verification service was replaced on Production. Uploaded files, database references, reviews and schema were not changed. No paid provider call or raw OCR capture was needed. Exact operational identifiers and attachment metadata evidence remain private and are excluded from knowledge and issue text.

## Resolution / invariants

Implemented and deployed: align the default OCR lookup order with Express, using application uploads first and public/uploads second. Keep an explicit PLAYER_AI_ASSET_ROOT confined to that root; do not silently broaden it. Fall back only on absence, not permission denial, symlinks, unsupported or oversized files. Retain strict filename validation, O_NOFOLLOW, realpath/inode checks and bounded reads. If a file is absent from all allowed roots, return422 with the safe OCR_DOCUMENT_NOT_FOUND code instead of a generic503.

Do not copy or move live attachments, rewrite references, delete cache or rerun paid OCR to diagnose this path mismatch. One-file metadata authorization does not authorize inspection of the rest of a team.

## Regression checks

A disposable synthetic fixture placed only in public/uploads reproduced ENOENT with the pre-fix compiled reader while the fallback file existed. The fixture contains a synthetic PNG signature only; no real document is used. Knowledge retrieval regression covers the document-info503/public-root query and all28 retrieval checks passed.

Focused service/API tests passed114/114, including fallback-only success with the primary directory present or absent, primary-root precedence, both files absent, explicit-root isolation, permission denial, symlinks in either root, and unsupported/oversized primary files without falling through. API tests verify safe422 responses for document-info, verification GET and submit, without inserting a job or calling the provider. Existing traversal guards remain covered. Strict build and full873/873 tests across58 suites passed. Only the verification service is allowlisted in the issue60 runtime contract; other runtime contracts remain unchanged.

## Follow-up / limitations

The user confirmed Production testing passed and explicitly requested closure on2026-11-10; issue60 was closed as completed. Record this as user-reported acceptance, not agent-authenticated browser verification or individual testing of every athlete/team. [Selective release evidence](../release/issue60-assets-33dca15/result.json) preserves the earlier runtime/backup identity, restart, worker/readiness, HTTPS and read-only DB checks. No further attachment access, paid OCR, Production mutation or restart was needed for closure. Do not assign this cause to other cases without evidence.
