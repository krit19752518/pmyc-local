# [FOOTBALL] Missing Demo team gender hides Phase 2 provinces

- Incident ID: FOOTBALL-INC-2026-11-09-08
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Source files: `src/models/team.model.ts`, `src/routes/api/api.router.ts`; deployed `phase2/src/RegistrationAdapter.php`, `phase2/src/DrawSetupPages.php`, `phase2/src/AreaDirectory.php`; `knowledge/test_search_incidents.py`
- Retrieval terms: RegistrationAdapter areaIndex gender NULL boy Phase2 province dropdown Demo import business required fields registration fallback INSERT

## Context / symptom

Phase 2 Stage 1 draw setup omitted a province even after the user approved synthetic Demo teams in that province.

## Confirmed observations

The observed registration schema stores gender on the team, not on each athlete. The synthetic team rows contained NULL gender. Phase 1 readers can display a boy fallback, while the deployed Phase 2 area discovery compares the actual persisted value with the selected division's gender. The shared geographic directory already contained the province and districts.

Province discovery and draw eligibility are separate. Discovery may include pending applications, but Stage 1 candidates require an approved team, a submitted active category and approved athlete documents in that category. Stage 2 provinces depend on existing competition scopes; Stage 2 teams come from advancement, not direct registration approval.

## Unknowns and hypotheses

No authenticated browser was available to inspect the user's selected event, division or role. No browser-cache cause is established. Source-generator/export-validator improvements and Local data normalization are separate pending work.

## Confirmed cause

The synthetic data writer populated schema-required fields but omitted a business-required team classification. The observed column was nullable, and no default supplied its missing value. Export/import field equality checks faithfully preserved NULL without proving compatibility with Phase 2 division discovery. `RegistrationAdapter::areaIndex` therefore filtered the rows because an empty gender did not match BOY or GIRL.

## Impact and artifact state

The user authorized setting boy for the imported Demo athletes. The corresponding exact Demo parent-team gender values were corrected on Production; no athlete gender column was added. Data-only audit and backup/rehearsal evidence are recorded in the project release ledger. Application code and schema were not changed.

## Resolution / invariants

Validate nonempty, supported persisted gender against the intended division before future seeding/export/import. Do not infer classification solely from a display fallback or set every unknown legacy row to boy. Require explicit user intent and an exact Demo scope for correction. Preserve approval, submission, player, official and document fields when changing gender.

Treat historical export packages as snapshots. A package created before gender correction and later document approvals must be revalidated/regenerated before any new import; do not rewrite old evidence to imply it already contained the corrected state.

## Regression checks

Production pure-function reproduction used the deployed PHP `areaIndex` with sanitized registration rows and no DB connection: NULL excluded the expected province; changing only in-memory gender to boy restored its two districts in U14_BOY/U16_BOY/U18_BOY. Production correction passed full-backup restore, rollback/commit rehearsal, protected-field digests and independent read-only verification. The same deployed area function then accepted the corrected persisted dataset. The incident-search regression protects retrieval for this cross-phase semantic mismatch.

## Follow-up / limitations

The Production data mitigation does not implement generator/export validation or Local synchronization. Authenticated draw-setup rendering remains a user check. Preserve the existing Stage 1/Stage 2 workflow and permission boundaries; do not populate Stage 2 by bypassing advancement to make a dropdown appear.

### Real-registration follow-up

Read-only review also confirmed that the deployed registration handler supplies gender in its primary INSERT but omits it from the fallback INSERT. With the observed nullable column and absent default, this is a confirmed write-path risk. It does not prove that the historical real-team NULL values were created by that path.

The user subsequently explicitly authorized boy for an exact active real-team NULL-gender scope. That correction was limited to captured team IDs, backed up and rehearsed, audited with gender-only snapshots, and independently verified; deleted teams and all other fields were preserved. This specific approval must not be generalized to future unknown-gender records. Registration/fallback validation remains separate pending application work.
