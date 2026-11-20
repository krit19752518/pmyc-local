# [FOOTBALL] Multiline OCR names and date-aware review prefills

- Incident ID: FOOTBALL-INC-2026-11-09-10
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Source files: `src/services/playerOcr.parser.ts`, `src/services/playerVerification.service.ts`, `src/routes/admin/adminPlayerVerification.router.ts`, `src/views/playerVerification.ts`, `tests/player-ocr-parser.test.ts`, `tests/player-verification-api.test.ts`, `tests/player-verification-ui.test.ts`, `tests/player-expiry-calendar.test.ts`
- Retrieval terms: multiline Thai name prefix surname automatic decision prefill expired card Bangkok yesterday cached expiry provenance parser revision

## Context / symptom

Issue #59 reports absent name comparisons in the athlete-detail modal. The approved change also requests editable automatic officer decisions and an expiry-only expired-card choice using yesterday as the inclusive cutoff.

## Confirmed observations

Synthetic OCR text with the title, given name and surname on separate lines was not extracted by the previous parser. Single-line complete names worked. Existing radio controls required manual choices even after a successful comparison.

## Unknowns and hypotheses

These synthetic reproductions do not establish the output layout or accuracy of every real document. No paid provider request or real document inspection was performed for this change.

## Confirmed cause

Name extraction expected complete names on one line. Cached extracted fields retain no raw OCR text, so missing names cannot be reconstructed from old cache alone. Expiry comparison also needs the current Thai calendar date rather than the date on which OCR ran.

## Impact and artifact state

Changes are limited to the six OCR/review source modules and generated output, regression tests and this knowledge entry. The original Production baseline fixture remains unchanged; a separate issue59 contract identifies the six approved behavior changes. No Production or athlete data was modified.

## Resolution / invariants

Collect a bounded multiline name within the labeled/bilingual name block. Reject incomplete or conflicting names; never substitute database or signature names. Parser v4 invalidates incompatible successful cache results and requires explicit paid retry confirmation.

Return suggestions per field and populate untouched radio controls without auto-saving. Preserve current staff edits and compatible saved choices. EXPIRED_CARD is permitted only for expiryDate. A validated expiry on or before yesterday in Asia/Bangkok is expired; today remains valid. Recompute this on cached reads and recheck stale automatic/saved choices before saving, without repeating OCR. Lifetime cards and birth-certificate expiry are handled separately.

Retain the editable document-status control. Add required team-facing reasons, record decision provenance and prior enum choices in transactional audit, and keep private notes separate. No face comparison is introduced.

## Regression checks

Parser tests cover multiline boundaries, damaged labels, missing surnames and conflicting names. Calendar tests cover Thai midnight and leap/month/year rollover. Service, API and UI tests cover four automatic choices, expiry-only validation, late-response draft preservation, saved review compatibility, stale expiry rejection and provenance audit. Run the full application suite and regenerate dist from strict TypeScript.

## Follow-up / limitations

Real OCR accuracy requires separately authorized provider testing. Old missing-name cache needs a confirmed fresh OCR request; merely opening the modal must not spend credit implicitly. Production deployment and user acceptance are separate steps.
