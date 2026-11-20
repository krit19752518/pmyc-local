# [FOOTBALL] SAT team inspection button fails when the page script cannot parse

- Incident ID: FOOTBALL-INC-2026-11-11-06
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-11
- Source files: `src/routes/admin/adminPortal.router.ts`, `tests/admin-auth.test.ts`
- Retrieval terms: SAT team inspection button inert unexpected identifier player openAdminEditTeamModal photo URL regex escaping rendered inline JavaScript

## Context / symptom

During Local Issue #66 acceptance, clicking the inspection button on the SAT team list left the popup closed.

## Confirmed observations

The browser reported `SyntaxError: Unexpected identifier 'player'` on page load and `ReferenceError: openAdminEditTeamModal is not defined` on click. The focused `IT-PAGE-04` test reproduced the syntax error while compiling the rendered Admin team page script.

## Unknowns and hypotheses

The authenticated Local check covered one athlete. The roster thumbnail uses separate URL construction.

## Confirmed cause

The TypeScript HTML template consumed the escapes in the photo URL regular expressions, emitting `/^(?:https?:)?///i` in browser JavaScript. The resulting syntax error prevented the entire inline script from running, including the team modal handler registration.

## Impact and artifact state

Local browser and synthetic rendered HTML checks confirmed the failure. The correction was built and loaded by the Local launcher on port 4500.

## Resolution / invariants

URL normalization uses a scheme check and string prefix handling so that it survives HTML rendering. The shared modal receives the same normalized URL under both photo field names.

## Regression checks

`IT-PAGE-04` compiles the complete emitted teams script. `IT-PAGE-06` executes the rendered player opener against absolute, protocol-relative, root-relative, relative, and empty photo URLs.

## Follow-up / limitations

In an authenticated Local SAT session, the team inspection button opened the team popup and its roster opened the player detail popup. The athlete image loaded from Local with nonzero intrinsic dimensions and did not use the placeholder.
