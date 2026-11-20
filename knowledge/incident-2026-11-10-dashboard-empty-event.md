# [FOOTBALL] New event incorrectly denied Dashboard access before child competition setup

- Incident ID: FOOTBALL-INC-2026-11-10-09
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-10
- Category: Phase 2 Dashboard event authorization
- Source files: `phase2/src/DashboardReadModel.php`, `phase2/src/DashboardPages.php`, `phase2/public/assets/workspace.js`, `tests/phase2-event-create.test.ts`
- Retrieval terms: Dashboard new empty event no child competition false403 Super Admin event catalog authorization Stage3 placeholder

## Context / symptom

After creating an event, the workspace Dashboard displayed a permission error for Super Admin. Event persistence had succeeded; the event had divisions but no child competitions or matches.

## Confirmed observations

A scoped read-only Local check confirmed event existence, three divisions, zero child competitions and zero matches. Source review showed the selected event was looked up only in authorized Stage1/2 child competition rows. Event-only placeholder authorization used the same child-existence requirement.

## Unknowns and hypotheses

Authenticated browser acceptance remains pending. Stage3/4 operation screens remain outside the current Dashboard scope. No cause is inferred from data counts alone; the incorrect denial branch is independently confirmed in source.

## Confirmed cause

An empty child query was treated as lack of event permission for every role, including Super Admin. The previous integration test created a child competition before loading Dashboard and missed the immediate post-create state.

## Impact and artifact state

Local PHP projection/view and filter JavaScript changes are active after restarting the verified Local listener through `npm run dev:local`. They perform no schema or business-data writes and do not create competitions, rosters or matches. Prior unrelated work is preserved; Production is outside scope.

## Resolution / invariants

Super Admin uses an independent event catalog without requiring child competitions. Other staff discover events only through the existing authorized Stage1/2 assignments and province predicate. Specific competition/match authorization remains enforced. Missing events return404 for Super Admin; unassigned staff get403 without event metadata. Conflicting event filters return400.

Dashboard shows event metadata, opened divisions and a setup notice/action for an empty event. Stage3-only and filtered-empty states have distinct wording. Event-only blank menus preserve event context without becoming operational forms. Changing event/season/data mode clears dependent division and non-readonly province selection. The new JavaScript asset URL is versioned.

Presentation follow-up on2026-11-11: the owner required the latest v16 prototype without extra Dashboard fields. The event card/setup actions and visible event/data-mode selectors described above were removed; event context is now hidden in the five-filter form. The independent event visibility and staff authorization fix remains. See [v16 presentation correction](incident-2026-11-11-dashboard-v16-presentation.md).

Source-preview follow-up on2026-11-11: the owner subsequently approved selecting master geography and reading eligible Phase1 teams before child competition creation. Event-only source previews now accept authenticated central/SAT roles without a child assignment; protected competition/match reads and mutations remain assignment scoped. This supersedes this incident's earlier denial of unassigned event-only previews. See [area/eligibility integration](incident-2026-11-11-phase1-area-eligibility.md).

## Regression checks

Synthetic real-PostgreSQL integration covers immediate post-create Dashboard before any child creation, event discovery, all seven blank menus, missing event404, conflicting filters400, unassigned staff403, assigned staff200, cross-event denial, and Stage3-only state with U18 girls default. Existing tests retain source-team reuse, idempotent creation, read-only previews, scope totals, result isolation and assignment/province checks.

Focused suite passed36/36. The first focused failure was an overbroad assertion rejecting a synthetic actor name that shared a prefix with the synthetic event name; the assertion now checks the full event name. A sandbox PostgreSQL test attempt failed to bind its private Unix socket with Operation not permitted; its log confirmed shutdown, then the test was rerun with the required escalation. No working Local database writes occurred in either attempt. No hook lock was edited or bypassed.

Final full Jest suite passed949/949 across61 suites, build and syntax/diff checks passed, and incident retrieval passed33/33. After Local restart, a PHP render using a synthetic Super Admin context against the user's existing event returned200 with the setup notice and management action. All seven contextual blank pages returned200. Before/after event/competition/match counts were unchanged. The actual Local JavaScript response matched the source hash. This render verifies backend readiness, not authenticated browser acceptance.

## Follow-up / limitations

Local PHP and JavaScript readiness is verified; user browser acceptance is pending. Opening Dashboard must never implicitly create competitions or import Phase 1 teams. This fix does not turn the intentionally blank future menus into implemented workflows.
