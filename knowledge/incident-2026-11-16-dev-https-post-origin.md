# [FOOTBALL] Dev HTTPS ceremony preparation rejected before PHP

- Incident ID: FOOTBALL-INC-2026-11-16-05
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-16
- Category: Phase2 Dev request origin
- Source files: `src/routes/phase2.router.ts`, `dist/routes/phase2.router.js`, `scripts/run-vps-dev.cjs`, `tests/phase2-post-origin.test.ts`
- Retrieval terms: ceremony prepare_ceremony Forbidden 403 HTTPS POST origin reverse proxy NODE_ENV development FOOTBALL_VPS_DEV CSRF

## Context / symptom

Owner reports a plain Forbidden page after pressing prepare competition and enter ceremony on Dev. The screenshot establishes the symptom, not its HTTP status or the identity of the rejecting layer.

## Confirmed observations

The verified Dev launcher sets NODE_ENV=development and FOOTBALL_VPS_DEV=1, and enforces the expected Dev host behind HTTPS hosting. Application trust proxy is not enabled. Phase2's POST gate previously used HTTPS only for production and otherwise used req.protocol. Its rejection body is Express's plain Forbidden; PHP's role/CSRF failures use different Thai messages.

A synthetic real-router regression with a signed synthetic session and valid CSRF reproduces HTTPS preparation returning403 before the upstream receives a request. The same baseline incorrectly accepts HTTP Origin on the Dev flag. No operational session, access secret, registration record, competition or draw is used.

## Unknowns and hypotheses

The exact live browser request and proxy headers remain unobserved. No WAF, browser-cache or account-role root cause is asserted.

## Confirmed cause

The POST origin policy omitted the explicit HTTPS-hosted Dev environment. Behind an internal HTTP request, a legitimate browser HTTPS Origin does not equal the inferred HTTP origin. This is a confirmed source defect and reproduction; the owner's exact authenticated request has not been captured.

## Impact and artifact state

The candidate changes only the Phase2 Node origin condition and regenerated module, with tests and knowledge. Original serving source is preserved until an independently verified Dev activation; no operational database writes occur in the regression.

## Resolution / invariants

Use HTTPS when NODE_ENV is production OR FOOTBALL_VPS_DEV is exactly1; otherwise retain req.protocol. Retain exact host/port origin equality, CSRF validation and session authorization. Do not enable global trust proxy or trust arbitrary forwarded host/protocol headers. Preserve backend roles, geographic scope, Demo isolation and draw/lock behavior.

## Regression checks

Fourteen synthetic HTTP integration cases cover the HTTPS prepare POST, unchanged query/payload and303 redirect, external/lookalike/null/wrong-port/HTTP origins, bad/missing CSRF, absent session, spoofed forwarded headers, production, ordinary Local HTTP, exact Dev flag and existing no-Origin behavior. Before fix:2failed/12passed; after fix:14passed. Build passes. Full-suite/CI and activation evidence are recorded separately for Issue94.

Historical runtime parity reverses only this exact condition before comparison with the prior contract; source/generated parity remains enforced.

## Follow-up / limitations

Authenticated Dev browser reproduction and Owner UAT are pending; synthetic success is not live UI acceptance. Runtime reload and source publication have distinct evidence. No Production access/deployment or operational competition/draw/schema mutation belongs to this fix.
