# [FOOTBALL] Demo selectors incorrectly exposed the full national geographic master

- Incident ID: FOOTBALL-INC-2026-11-11-03
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-11
- Category: Phase 2 Demo geographic scope
- Source files: `phase2/src/DashboardReadModel.php`, `phase2/src/DashboardPages.php`, `phase2/src/TeamSetupPages.php`, `phase2/public/assets/workspace.js`, `tests/phase2-event-create.test.ts`
- Retrieval terms: Demo province district options national master filtering is_test existingAreas areaIndex empty SAT hard-code

## Context / symptom

The owner reported that the Demo pages offered every province/district despite a smaller Demo dataset, and approved limiting Demo selectors to existing Demo areas while preserving the full national master for real events.

## Confirmed observations

The prior area integration unconditionally used AreaDirectory for both modes. RegistrationAdapter already supplies a Demo-aware age/gender area index excluding deleted teams and cancelled categories. That discovery intentionally includes applications that are not yet approved; competition eligibility is checked separately.

## Unknowns and hypotheses

No authenticated browser visual acceptance is claimed. Missing gender or invalid geographic source values can affect discovery, but no such data issue is inferred or repaired in this change.

## Confirmed cause

The full-master requirement for real data was applied to Demo as well, rather than branching on the selected event's validated data mode and division.

## Impact and artifact state

Local read-model/view/JavaScript and test changes only; no schema, team, approval, roster, draw or match writes. The prototype still has five visible filters. Production and uploads are outside scope.

## Resolution / invariants

Demo geography uses the shared existingAreas(true, selected division) index; no province names are hard-coded. Real geography continues to use all77 master provinces. Province/district pairs must be canonical and also belong to the Demo selection, enforced server-side. The same model serves Dashboard and Setup.

SAT province stays pinned to authenticated account state. If that province/division has no Demo areas, district selection is disabled with an explanation in the existing field/table slots. Empty Demo divisions do not fall back to the full master. A changed Demo division clears the central province and district before reloading; SAT province remains locked.

Authorized committed draw areas remain accessible even if their registration source later disappears, preserving history. Uncommitted competition rows alone do not broaden Demo options. Stage2 keeps advancement rosters; discovering Demo geography does not import registration teams into Stage2.

## Regression checks

Disposable PostgreSQL fixtures distinguish Demo areas from real-only, deleted, cancelled and wrong-gender areas. Tests cover Demo source options, real77, missing Demo area400, SAT foreign province403, SAT own province without Demo200 with disabled districts, empty division, age-specific areas, dynamic new Demo province before approval, and committed roster preservation after source deletion. Existing first-eight/approval, fewer-than-eight and role/history isolation tests remain. Focused tests passed51/51; full Jest passed964/964 across61 suites; build, syntax/diff checks and incident retrieval36/36 passed.

After restarting the verified Local listener, read-only rendering confirmed Demo province/district options match the existingAreas source index, real selectors retain77 provinces, SAT outside the Demo dataset remains pinned with empty districts, and served JavaScript matches source bytes. Event/competition/match counts were unchanged. Authenticated browser visual acceptance is pending.

A separate aggregate-only source diagnostic confirmed missing persisted team gender on active Demo source records excluded by the selected division. This is distinct from the full-master presentation bug and matches the prior [missing-gender incident](incident-2026-11-09-demo-gender-discovery.md). No classification was inferred or corrected. Source data correction requires owner confirmation of the intended gender and exact scope.

## Follow-up / limitations

Local readiness is verified; user browser acceptance is pending. Do not expand Demo selectors to all master areas merely to make an empty data state selectable, and do not mutate source data to populate the selectors without the owner's explicit classification/scope confirmation.
