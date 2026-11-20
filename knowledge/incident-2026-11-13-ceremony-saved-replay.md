# [FOOTBALL] Saved ceremony result hid the ball after refresh

- Incident ID: FOOTBALL-INC-2026-11-13-03
- Status: verified
- Resolution: mitigated
- Observed: 2026-11-13
- Last verified: 2026-11-13
- Category: product defect
- Source files: `phase2/src/CeremonyPages.php`, `tests/phase2-event-create.test.ts`, `tests/fixtures/phase2-ceremony.php`, `phase2/public/assets/workspace.js`, `phase2/public/assets/workspace.css`, `tests/ceremony-reveal.test.ts`
- Retrieval terms: ceremony saved draw replay ball counter refresh reveal named team balls bracket long names ellipsis

## Context / symptom

Returning to a ceremony with an existing draw showed pairs without the ball panel.

## Confirmed observations

The renderer created the ball only when the query reveal value matched the committed draw. JavaScript removes that query parameter after loading. Refresh therefore omitted the panel. Read-only Local inspection confirmed the reported Demo competition already had a draw; no operational identifiers are retained here.

## Unknowns and hypotheses

Authenticated visual browser acceptance remains pending. This finding does not establish a problem with draw randomness.

## Confirmed cause

Saved-result rendering coupled panel visibility to one-time animation rather than the ceremony view.

## Impact and artifact state

Local source only. No operational draw, roster, competition, confirmation or Production data was changed by this fix.

## Resolution / invariants

Keep the ball panel on the ceremony saved-result view. Offer a GET link to replay the current committed version using the existing reveal path, including locked results. Replay does not invoke a draw POST or change confirmation status. Review/confirmation pages and permissions retain their existing behavior. Refresh displays saved pairs immediately; reduced motion remains supported.

## Regression checks

Integration checks cover the persistent panel, replay link, locked replay and unchanged draw-history count. Client checks cover ordered committed pairs and reduced motion. Run the focused ceremony tests and full Local suite; the pre-existing adminReports production-parity failure is outside this fix.

## Follow-up / limitations

User visual acceptance on Local4500 remains required. No Production release is included.

## Named-ball presentation follow-up (2026-11-13)

Owner clarified that the intended ceremony has one white ball per team, moving during reveal, fading one at a time into its saved bracket position. The previous single ordinal ball was insufficient. Verified GitHub reference: Jerdyy/PMYCfootball_Phrase2, commit 4e406ec7ac63f377648e37fc6c1b800fb7329122, prototype/05-draw-ceremony.html provides seven white numbered balls and CSS mix animation. The v16 province-operations/app.js at 43dbd7c329b010da2de3b81a6b9d5e83fb469cba instead has one pair counter. Neither reference implements the complete named-ball-to-bracket requirement; prototype sessionStorage and prearranged results must not replace backend draw authority.

Local now renders one named ball per eligible team on the start form and per committed slot on result/replay. Cosmetic display order is independent of reveal order; A1..An are opened from the saved slots. Each ball fades while its corresponding bracket destination appears. Every team has one destination, including direct-entry teams and single-team automatic qualifiers. Future winner positions stay placeholders. After completion, the empty machine collapses. Refresh shows saved names; replay is still GET-only. Names use a four-line ellipsis with a full-name tooltip, while bracket names remain complete and escaped. Motion is bounded within lanes to keep labels apart; reduced motion opens all saved slots immediately.

Synthetic Chrome checks cover desktop and mobile rendering, all eight destinations opening, no page errors, no body horizontal overflow and reduced motion. These checks do not constitute authenticated Local database UI acceptance. Additional regressions cover one/three/eight teams, saved order independent of visual order, locked replay, full-name escaping and no browser randomness/network mutation. Local owner acceptance remains pending; no Production changes or operational draw actions are included.

## Owner Local acceptance and GitHub handoff (2026-11-14)

Owner reports Local4500 testing passed and authorized release preparation. Dedicated tracking issue: krit19752518/pmyc-football #82; #81 is the related Dashboard issue. Production verification remains pending.
