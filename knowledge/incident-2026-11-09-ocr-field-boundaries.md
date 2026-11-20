# [FOOTBALL] Plain-text OCR date extraction must respect field labels

- Incident ID: FOOTBALL-INC-2026-11-09-05
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Category: deterministic OCR extraction
- Source files: `src/services/playerOcr.parser.ts`, `src/services/playerOcr.date.ts`, `tests/player-ocr-parser.test.ts`
- Retrieval terms: iApp plain text OCR date window birth expiry issue label confidence format checksum parser

## Context / symptom

While implementing the approved OCR-only flow in the isolated
`feature/issue55-iapp-ocr-20261109` checkout, synthetic tests found a clearly
labeled birth date reported as ambiguous. These source paths refer to that
feature branch, not the older dirty application checkout or Production.

## Confirmed observations

The synthetic card included both Thai and English birth dates, an address line,
and a later issue date. Three parser/comparison assertions failed. No real
document, provider request, athlete row or production operation was involved.

## Unknowns and hypotheses

The accuracy of iApp plain-text output and the four-field parser on representative
documents remains unmeasured beyond a single authorized integration sample. Provider marketing benchmarks are
not application-level ID-card acceptance evidence.

## Confirmed cause

The initial two-line look-ahead around the English birth-date label reached an
unlabeled issue-date value following the address. The parser correctly treated
two different dates as ambiguous, but the candidate window was too broad.

A subsequent authorized integration test also confirmed that OCR can corrupt
the printed Thai name label while preserving a titled name. Exact-label-only
extraction then left the name missing even though the bilingual name block
provided enough structural boundaries for extraction.

A later authorized integration exercise confirmed another layout boundary:
plain-text OCR can flatten issue and expiry dates into two-column lines. Dropping
an unparseable candidate and choosing the remaining valid date can incorrectly
return the issue date as expiry. Synthetic regressions reproduce this without
retaining any document text or personal values.

## Impact and artifact state

The failure affected synthetic field-comparison assertions in the isolated Local
implementation. No original sample documents, application records or Production
artifacts were changed. The first knowledge-regression run rejected this entry
because it omitted this required section; the retriever failed closed without
changing files. The abbreviated README template was corrected to match the
retriever's eight required headings before rerunning the checks.

## Resolution / invariants

Prefer dates on the label's own line. Use only immediate neighboring lines when
the labeled line contains no date, and reject neighboring issue/other-field
labels. Conflicting Thai/English dates remain ambiguous; never choose the value
that happens to match the athlete database. A missing surname must not be filled
from a copy-certification signature. Plain-text OCR supplies no word confidence;
use null confidence and separate deterministic format validation. A valid ID
checksum is not registry or document-authenticity verification.

For a damaged name label, accept a complete titled Thai name only between a
nearby ID-number label and the English surname label. Require a title boundary
and at least given name plus surname. Do not search address, issuer or signature
text for replacement names. Reparse an already authorized provider response
offline when diagnosing extraction; never repeat a paid call implicitly.

The new flow requires four officer decisions and removes the retired face
decision requirement. Historical reviews are preserved. Source-bound reviews,
private/team-note separation and transactional audit remain required.

## Regression checks

`tests/player-ocr-parser.test.ts` verifies date-label boundaries, contradictory
dates, lifetime expiry, missing names, Thai numeric glyphs and checksums using
synthetic text only, including damaged-name-label and out-of-block negative
cases. Provider and PostgreSQL fixtures verify shared paid-attempt
reservations, cross-process cache leases and no implicit network retry. Browser
fixtures verify page/frame selection and staged progress with manual closing.

## Follow-up / limitations

The implementation is local and isolated; it has not been deployed. One expressly
authorized real integration call succeeded, followed by offline parser diagnosis;
field presence and format validation do not establish transcription accuracy.
Credentials and user-submitted samples are
operational data and are excluded from this record, tests and source bundles.
See the [implementation review](../release/issue55-iapp-20261109/README.txt) for
the exact feature checkout, source bundle and validation scope.

## Subsequent verified safeguards

The isolated feature implementation now accepts only bounded label variants,
keeps all extracted field values uncorrected, and maps paired dates by explicit
issue/expiry label order. An unaligned multi-date neighborhood remains ambiguous;
an invalid month is never repaired from expected athlete data. ID-header fallback
stops before the name/DOB/address block. This deliberately leaves some visually
readable fields for staff rather than increasing coverage with guessed values.

OCR preparation operates on source bytes, renders the selected PDF region at
higher resolution than its preview under fixed limits, and offers manual
four-corner rectification, small-angle rotation and optional contrast adjustment.
Quality hints are heuristics; absence of a warning does not establish absence of
glare. The free preparation-preview API preserves role, province, CSRF and
document-version checks and never reserves a paid call.

Parser-revision changes must not reuse an outdated cached analysis or silently
spend another credit. Both the provider cache and route require explicit paid
retry confirmation for an existing document with an old parser revision. Source
hashes include the parser revision. Synthetic cache, route and browser tests
cover this invariant. Real responses used for offline diagnosis stay in private
operational storage and are excluded from Git, fixtures and this knowledge base.
