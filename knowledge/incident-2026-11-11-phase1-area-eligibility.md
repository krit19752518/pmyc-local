# [FOOTBALL] Area selectors and eligible teams depended on pre-existing Phase 2 competitions

- Incident ID: FOOTBALL-INC-2026-11-11-02
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-11
- Category: Phase 1 registration to Phase 2 team selection
- Source files: `phase2/src/DashboardReadModel.php`, `phase2/src/RegistrationAdapter.php`, `phase2/src/TeamSetupPages.php`, `tests/fixtures/phase2-team-selection.php`, `tests/phase2-event-create.test.ts`
- Retrieval terms: province master77 assigned SAT district first8 approved team all athletes registration created_at fewer eight eligibility source preview

## Context / symptom

The owner required central admins to choose any province, SAT officers to retain their assigned province, and district selection to load up to eight eligible Phase 1 teams in registration order before creating child competitions. Fewer than eight teams may proceed; draw-time bracket/BYE rules determine the structure.

## Confirmed observations

Dashboard geography was built from existing authorized competition rows, and its team KPI used competition rosters. The registration adapter already filtered team approval, active submitted age/gender and all selected-category athlete approvals before taking the first eight by created_at then ID. Phase 1 registration inserts the team row at registration; database created_at is the existing ordering source.

## Unknowns and hypotheses

No authenticated browser screenshot verification is claimed. Existing legacy timestamps with missing values remain last in the established order; no dates or source records are repaired. This does not implement later ceremony/schedule menus.

## Confirmed cause

Persisted competition geography and roster availability were used for a workflow that needs to discover registration source teams before any competition exists.

## Impact and artifact state

Local read-model, read-only setup preview and tests change. No schema, registration, approval, roster, draw or match writes are required. Prototype field layout remains five visible filters. No uploads or Production access is involved.

## Resolution / invariants

Use the existing Phase 1 geographic master for all77 central province choices and their districts. SAT province comes from authenticated account state and is validated server-side; foreign provinces and invalid province/district pairs are rejected.

Subsequent owner clarification: the all77 master rule applies to real data. Demo selectors now use existing Demo registration areas by division, with a pinned SAT province/no-data state and preservation of authorized committed draw history. See [Demo area correction](incident-2026-11-11-demo-area-options.md).

Authenticated national event metadata is available for source preview before assignment. This supersedes the earlier child-assignment requirement for event-only source preview, not for protected competition/match history or mutations. Competition reads still use existing assignment/province predicates, and existing write endpoints retain their role/scope checks.

Dashboard and the v16 Setup page share the registration adapter's cutoff and approval rules. A summary mode reads only athlete category/approval fields, without athlete names or official records, and does not alter full snapshots or eligibility fingerprints. Selected Stage1 source previews refresh before a draw; committed draw rosters remain historical snapshots. Stage2 continues to use linked advancement rosters rather than importing approved registrations.

Take up to eight eligible teams, not eight applications before filtering. Same registration timestamp uses source ID as stable tie-breaker; missing timestamps remain last. One through eight teams use the existing DrawEngine, with BYEs represented as advancements rather than fabricated matches. Zero eligible teams cannot proceed. Changing area is read-only and does not create a competition.

## Regression checks

Disposable PostgreSQL fixtures cover all77 province options, assigned SAT province, tampered province/district, approval exclusions, pending athletes in another age group, stable timestamp ties, Demo/real separation, no implicit competitions, fresh approval refresh, immutable committed rosters, and candidate counts0 through8 plus more than8. Summary/full candidate IDs agree. Focused tests passed49/49; full Jest passed962/962 across61 suites; build, syntax/diff checks and incident retrieval35/35 passed.

After restarting the verified Local listener with the standard launcher, a PHP render using synthetic contexts against the existing Local event confirmed77 central provinces, only the assigned SAT province,403 for a forged foreign province and200 for the setup team table. The sampled district returned zero eligible teams; no cause is inferred from that count. Event/competition/match counts were unchanged. An anonymous HTTP request returned403. This verifies readiness, not authenticated browser acceptance.

A multi-file patch initially failed validation because it targeted the same test file twice. A read confirmed no changes to the intended targets before the patch was consolidated and applied. No hook lock was edited or bypassed.

## Follow-up / limitations

Local readiness is verified; user browser acceptance is pending. Setup now displays the selected eligible teams; six future destinations remain intentionally blank. Do not infer that a read-only ceremony link grants write authority or that source preview commits a roster or draw.
