# [FOOTBALL] Issue70 cumulative OCR budget and unpopulated photo captions

- Incident ID: FOOTBALL-INC-2026-11-12-01
- Status: verified
- Resolution: open
- Last verified: 2026-11-12
- Source files: `src/services/playerOcr.provider.ts`, `src/services/playerOcr.config.ts`, `src/views/playerVerification.ts`, `src/routes/admin/adminPortal.router.ts`, `tests/player-verification-ui.test.ts`
- Retrieval terms: issue70 OCR_BUDGET_EXCEEDED trial cumulative total daily monthly quota modalPlayerName modalPlayerIdCard modalPlayerPos populateDetails teams popup captions

## Context / symptom

After the issue70 preview release, Production teams-page athlete popups still showed an OCR budget error and placeholder captions beneath the athlete photo.

## Confirmed observations

Read-only Production artifact hashes matched the issue70 release manifest for the verification router and shared view. The deployed view's populateDetails populated detail groups but omitted assignments to modalPlayerName, modalPlayerIdCard and modalPlayerPos. The teams-page opener delegates to that shared initializer. Separate read-only aggregate usage and explicitly allowlisted worker budget settings confirmed exhaustion of the cumulative trial cap while the daily and monthly caps still had room. No live configuration values or operational row contents are retained here.

## Unknowns and hypotheses

Provider account credit was not queried. Authenticated browser verification was unavailable because the browser access host was unavailable. A fresh runtime-artifact hash does not prove which code an already-running worker has cached.

## Confirmed cause

The shared initializer omitted three photo-caption assignments; populating the AI comparison table does not populate those separate elements. Independently, analyzeWithIapp checks cumulative total against trialPageLimit as well as daily/monthly totals before reserving a paid attempt or contacting iApp. OCR_BUDGET_EXCEEDED therefore need not mean provider credit exhaustion. The cumulative cap does not reset at midnight.

## Impact and artifact state

The follow-up implementation changes Local source/generated artifacts and synthetic tests only. No Production file, setting, database row, schema or process was changed; no attachment or paid OCR request was accessed. Existing Local caption assignments were retained. Source was reconciled with the deployed preview diagnostics so the candidate does not remove the error request reference. The two existing routers remain outside the three-file runtime release allowlist.

## Resolution / invariants

Keep issue70 open. The Local candidate populates all three captions in the shared initializer and tests the teams-page entry path. Production correction still requires a reviewed release. The user subsequently explicitly authorized unlimited application OCR quotas. Implemented an opt-in PLAYER_OCR_QUOTA_MODE=unlimited, with limited mode retained as the default and invalid modes rejected. Unlimited mode skips only the page-cap check; it retains accounting before network, cache leases, authentication, provider error handling and explicit paid retries. Do not clear usage history, change the budget ID to evade a cap, or infer remaining provider credit from application usage.

## Regression checks

Synthetic checks cover all three captions through the teams-page opener, switching athletes, preservation of deployed preview references, unlimited usage above all old caps, accounting failure before network, invalid mode, credentials, cache, duplicate leases and explicit retry. Runtime inverse-edit checks reconstruct the entire three-file deployed baseline, and separate snapshots preserve the two unchanged routers. Knowledge retrieval regression covers the cumulative-budget/photo-caption diagnosis. Final Local full suite passed996/996 in61 suites; TypeScript build and syntax checks passed. Knowledge retrieval passed40/40. These checks do not establish Production acceptance.

## Follow-up / limitations

Prepare and review any corrective release separately, preserve unrelated Local work, and verify the authenticated Production teams popup after deployment. The earlier issue70 release remains partially verified in `production-release-ledger.md`.
