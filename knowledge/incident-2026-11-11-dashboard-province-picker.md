# [FOOTBALL] Admin Dashboard province choices were hidden by a prefilled datalist

- Incident ID: FOOTBALL-INC-2026-11-11-04
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-11
- Category: Phase 2 Dashboard province selector UX
- Source files: `phase2/src/DashboardPages.php`, `phase2/public/assets/workspace.js`, `tests/fixtures/phase2-team-selection.php`, `tests/phase2-event-create.test.ts`
- Retrieval terms: Dashboard Admin province picker datalist prefilled current Bangkok Chiang Mai U16 Demo dropdown select

## Context / symptom

An Admin opening the Production Demo Dashboard with Bangkok already selected reported that Chiang Mai could not be selected for U16 boys.

## Confirmed observations

Production READ ONLY aggregate checks confirmed active Demo U16 boys data in both Bangkok and Chiang Mai. The event is Demo and includes `U16_BOY`. Production `DashboardReadModel.php` and `RegistrationAdapter.php` hashes matched the deployed release.

## Unknowns and hypotheses

Authenticated browser visual acceptance was unavailable because the browser access host was unavailable. The native browser suggestion behavior was inferred from the prefilled `input`/`datalist` markup and the Admin's report, then addressed structurally; no browser screenshot is claimed.

## Confirmed cause

The central Admin province control was an `input` backed by a native `datalist`, prefilled with the current province. Browsers filter datalist suggestions by the current text, making other valid province choices difficult to discover. The area query and Production Demo data were correct.

## Impact and artifact state

Local PHP/JavaScript presentation and disposable regression fixtures only. No Production code or database changes were made.

## Resolution / invariants

Central Admin and Document Verifier province choices use a native `select`, which presents every option in the selected event/division scope while retaining the current selection. SAT province remains a read-only input tied to account scope. Server-side authorization, canonical province/district checks, Demo/real separation, and division-specific area filtering are unchanged. No province names are hard-coded.

## Regression checks

The disposable PostgreSQL fixture now includes both Bangkok and Chiang Mai for Demo `U16_BOY`; rendered Admin HTML must expose both options while keeping Bangkok selected. Existing SAT read-only, Demo source filtering, wrong-province, and empty-area tests remain. Focused tests passed; full Jest passed 970/970 across61 suites; PHP lint, JavaScript syntax, and `git diff --check` passed.

## Follow-up / limitations

Local implementation is ready. Production UI acceptance and deployment are pending; the authenticated Production browser could not be inspected in this turn. Do not broaden area queries or mutate team classifications to work around a presentation problem.
