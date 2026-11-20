# [FOOTBALL] Prefix-free name review and evidence-based field details

- Incident ID: FOOTBALL-INC-2026-11-10-03
- Status: verified
- Resolution: resolved
- Last verified: 2026-11-10
- Source files: `src/services/playerOcr.name.ts`, `src/services/playerOcr.types.ts`, `src/services/playerVerification.details.ts`, `src/services/playerVerification.service.ts`, `src/views/playerVerification.ts`, `tests/player-verification-details.test.ts`, `tests/player-ocr-name-review.test.ts`, `tests/player-verification-ui.test.ts`, `tests/player-verification-api.test.ts`, `tests/player-ocr-provider.test.ts`
- Retrieval terms: prefix-free name surname detailed comparison V5 V6 compatible cache title ignored manual override combining mark

## Context / symptom

Issue61 changes the player detail popup: append the current team to its header, show the approved red bold staff guidance, and explain each comparison using retained field evidence. The user explicitly excludes title/prefix from name analysis. This supersedes the V5 title-validation policy in [the earlier prefix incident](incident-2026-11-10-ocr-prefix-name-rejection.md).

## Confirmed observations

The previous implementation could require manual intervention solely because a title was missing or misread. Generic field messages also hid distinctions between a missing value, invalid format and an actual mismatch. Synthetic cases reproduce both behaviors; no live records or documents were accessed for this change.

## Unknowns and hypotheses

This change does not establish or improve the OCR provider's image-reading accuracy. A missing cached name cannot reveal which characters were originally returned and discarded.

## Confirmed cause

Name validation mixed title validity with personal-name completeness. Result rendering lacked structured field explanations. Parser revision changes previously treated all prior results as non-reusable, even where retained values could be evaluated locally.

## Impact and artifact state

Local source and generated runtime implement the approved policy. The eight-file selective Production release completed on2026-11-10 after separate Gate A/B approvals; runtime/service/HTTP/DB checks passed and authenticated UI remains pending user acceptance. Existing authoritative title/name fields, document files, schema and stored OCR evidence were not rewritten. See the [release result](../release/issue61-71e9c15-20261110T061804Z/result.json).

## Resolution / invariants

- Only bounded recognizable titles are stripped. Full titles require a whitespace boundary; dotted child-title variants have explicit boundaries. Preserve actual names such as นางนวล and นายธรรม. Do not fabricate missing personal-name letters from the database.
- Missing, different or misread titles alone do not invalidate a complete matching personal name, create a mismatch, or require a fresh staff choice. Incomplete/invalid personal names still require staff review.
- Name/surname details identify separate tokens only when the retained text supports that split. Character/mark differences describe observed strings, not presumed damage in the image.
- ID explanations distinguish missing text, digit count, checksum and differing positions. Dates distinguish unavailable components, invalid calendar values and differing day/month/year. Do not invent missing positions or blame the registered data merely because OCR differs.
- Unknown document type and multiple IDs are document-level notices, with no field prefill. Staff can examine attachments and explicitly decide each field. Staff choices, status, audit, province access, reset and Thai-date expiry protections remain covered by regression tests.
- Parser V6 accepts structurally complete V5/V6 cached analyses. The source-binding family remains V5 to preserve the document/player/selection/reset binding. Original stored `modelVersion` and evidence remain unchanged. Re-evaluate retained name candidates in memory; explain missing old values. No automatic paid reread, cache deletion or backfill.
- Header, explanations and OCR values use plain text. The red bold staff guidance remains separate from actual processing/API errors.

## Regression checks

Local build and all 900 tests in 59 suites passed, including synthetic UI/API/provider/cache cases and source/runtime parity. Knowledge retrieval has a dedicated prefix-free/cache/details regression. Actual browser acceptance and real-document OCR accuracy are separate checks.

## Follow-up / limitations

The user reports Local and Production acceptance passed on2026-11-10 and explicitly requested closure. Issue61 was closed as completed at2026-11-10T06:46:18Z. [User acceptance evidence](../release/issue61-71e9c15-20261110T061804Z/production-acceptance.json) is separate from the agent's historical unverified browser check; no deployment evidence is rewritten. The [draft deployment plan](issue61-production-deployment-plan.md) records the original proposal. A change to future extraction that cannot safely reuse V5 retained values must introduce a new binding family; do not keep the V5 binding merely to suppress a legitimate stale-result check.
