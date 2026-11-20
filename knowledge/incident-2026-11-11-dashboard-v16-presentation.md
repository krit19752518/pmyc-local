# [FOOTBALL] Dashboard presentation drifted from the latest v16 reference

- Incident ID: FOOTBALL-INC-2026-11-11-01
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-11
- Category: Phase 2 UX reference fidelity
- Source files: `phase2/src/DashboardPages.php`, `phase2/public/assets/workspace.js`, `phase2/src/WorkspaceView.php`, `tests/phase2-event-create.test.ts`
- Retrieval terms: Dashboard v16 UX prototype five filters extra event card data mode selector hidden context presentation drift

## Context / symptom

The user reported extra fields and content on Dashboard compared with the latest provincial review prototype. The owner explicitly required the latest UX/UI as presentation authority and prohibited combining prior-version display elements into it.

## Confirmed observations

The reference filter row contains season, age division, stage, province and district, with automatic updates. Local presentation also had an event metadata/setup card, event and data-mode selects, management links, a scope count and a manual display button. Additional implementation explanations had replaced several reference descriptions.

## Unknowns and hypotheses

Browser automation was unavailable (`The browser access host is unavailable`). Source/render assertions establish structure and field contract, not a visual screenshot match. Some prototype-only schedule publication and lineup-lock semantics are not implemented in the current backend; their values must not be fabricated for visual similarity.

## Confirmed cause

Presentation additions were introduced while integrating persisted context and repairing empty-event authorization. Backend requirements were allowed to expand the Dashboard display beyond the current prototype.

## Impact and artifact state

Changes are limited to Local PHP presentation, filter JavaScript, asset version and regression expectations. No schema or business-data changes are required. The independent event authorization fix remains in the read model. Prototype reference files are read-only and unchanged.

## Resolution / invariants

Use the latest reference for visible Dashboard structure. Remove the extra event card, management links, context-select row, scope count and manual submit button. Retain exactly five visible filters. Carry event ID and real/Demo mode as hidden, validated context rather than visible controls. Preserve event context across automatic filter requests. Event creation and management remain on Platform pages.

Restore reference labels and concise descriptions in existing slots. Keep actual authenticated role/scope, unavailable-data markers and existing access checks; prototype demo role switching and fabricated fixture values are not application behavior. Future operational menu pages remain blank as requested.

## Regression checks

The existing real-PostgreSQL integration test now asserts exactly five visible filter labels, hidden event/data-mode context, no event metadata/setup card or management links, automatic-update wording and no visible submit button. Existing empty-event, missing-event, contradictory-filter and assigned/unassigned staff tests remain. Focused tests passed36/36; full Jest passed949/949 across61 suites. Build, PHP/JavaScript syntax, diff checks and incident retrieval34/34 passed.

Local was restarted through the standard launcher after verifying the exact old process. A subsequent PHP render against the existing Local event returned200 with exactly the five reference filter labels, preserved hidden event ID, no extra card and no manual submit. Event/competition/match counts were unchanged. The actual Local JavaScript response matched source bytes. This verifies structure and readiness; authenticated browser visual acceptance is still pending.

## Follow-up / limitations

Local readiness is verified; obtain user browser acceptance. Keep the current UX source as the default authority for subsequent menu work; do not restore old widgets merely because their underlying data still exists.
