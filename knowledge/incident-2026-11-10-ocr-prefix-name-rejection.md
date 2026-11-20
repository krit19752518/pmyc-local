# [FOOTBALL] OCR prefix errors can suppress a returned Thai name candidate

- Incident ID: FOOTBALL-INC-2026-11-10-01
- Status: verified
- Resolution: open
- Last verified: 2026-11-10
- Source files: `src/services/playerOcr.name.ts`, `src/services/playerOcr.parser.ts`, `src/services/playerOcr.debug.ts`, `src/services/playerOcr.diagnostics.ts`, `tests/player-ocr-parser.test.ts`, `knowledge/ocr-debug-issue59.md`
- Retrieval terms: unsupported child title prefix English label-only payload parser rejects candidate offline counterfactual scoped record category duplicate identity

## Context / symptom

Issue59 investigation found a successful general-document OCR response reported as a missing fullName. A structural name-label flag did not establish that the provider returned correct name values.

## Confirmed observations

An expressly authorized private capture contained the printed Thai name label followed by an unsupported child-title abbreviation and two Thai tokens. The expected given name and surname were not present exactly, even after whitespace normalization. The English name region contained labels only, without English name values. Other extracted identity/date fields passed their deterministic format checks; this does not establish overall OCR accuracy.

## Unknowns and hypotheses

The provider's internal reason for character errors and omitted English values is unknown. Bright/overlaid, lower-contrast regions were visible in the inspected name bands, but this alone does not prove why the provider failed. Another category's previously stored result has no equivalent raw capture and must not be assigned the same root cause by assumption.

## Confirmed cause

The parser accepts only known Thai title prefixes and a complete Thai-name pattern before retaining a candidate. An OCR child-title variant such as `ด.ป` fails this guard, so the entire field becomes MISSING even though the provider returned Thai text in the name region.

An offline, in-memory counterfactual changed only that prefix to a supported child title. The same parser then returned VALID format, but its canonical name still differed from the expected name. Prefix correction alone therefore cannot justify MATCH or automatic approval. The English-label flags likewise did not establish the presence of English field values.

## Impact and artifact state

The application parser and stored review results were not changed during diagnosis. Raw provider text remained in private operational capture storage, outside the web root and Git. Derived image bands were deleted after inspection. No personal names, identifiers, document contents or capture payloads are retained here.

Two legitimate records sharing a name across categories initially caused the diagnostic control to bind a different record from the user's retry. Reconciliation used the exact new job and category. An interrupted configuration change was inspected before continuing; only staged configuration existed at that point. Future diagnosis must identify the exact record before spending a retry.

## Resolution / invariants

**Current policy supersedes title validation:** issue61 explicitly excludes titles from analysis. See [prefix-free review and field details](incident-2026-11-10-ocr-prefix-free-details.md) for the Local V6 implementation. The following V5 description is historical and must not be reinstated as a current requirement.

The approved local V5 implementation separates name-candidate extraction from title/format validation, preserves the original candidate, and displays separate title and personal-name comparisons. An invalid candidate or mismatched title requires an explicit staff decision; automatic approval is rejected server-side. English values are supplementary and label-only blocks remain missing. Keep this issue open pending Production deployment and acceptance. Do not silently turn an unsupported prefix into a known title or use database values to fabricate an OCR result.

Check actual English values, not merely Name/Last name labels. Bind private diagnostics to record/job/category rather than the displayed name. Inspect the exact prepared image and source hash for that same job. Replay one authorized response offline; do not request additional paid OCR calls automatically.

## Regression checks

Knowledge retrieval includes unsupported-prefix rejection and category-specific debug-scope queries. Synthetic regression cases in `tests/player-ocr-name-review.test.ts`, UI and API tests cover unsupported titles, misspelled name tokens, label-only English fields, explicit staff decisions and prevention of false MATCH after prefix repair. An offline replay of the authorized capture retained the candidate as INVALID with no automatic decision; the personal-name mismatch remained. No provider request was made during replay. Diagnostic trace probes were disposable and did not modify application code.

## Follow-up / limitations

The parser fix is local only; no Production parser fix or stored-result backfill has been performed. Earlier cached MISSING fields cannot recover discarded text without an authorized retained response; upgrading the parser must not silently trigger a paid retry. Format-valid and identity-matching are separate outcomes. Real-image preprocessing or provider changes require separately bounded evaluation; the evidence does not justify a blanket requirement to reupload every image or an automatic extra-credit retry.
